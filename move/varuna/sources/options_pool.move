// File: sources/options_pool.move

module varuna::options_pool {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field as df;
    use std::option::{Self, Option};
    use sui::event;
    
    // DeepBook integration
    use deepbook::pool::Pool;
    use deepbook::balance_manager::BalanceManager;

    // ====== Error Codes ======
    const EPoolNotExpired: u64 = 0;
    const EPoolExpired: u64 = 1;
    const EPoolAlreadySettled: u64 = 2;
    const EInsufficientCollateral: u64 = 3;
    const EOptionNotExercisable: u64 = 4;
    const EInvalidOptionType: u64 = 5;
    const EZeroAmount: u64 = 6;
    const EPriceNotSet: u64 = 7;
    const EInvalidStrikePrice: u64 = 8;
    const EInvalidExpiration: u64 = 9;
    const EInvalidPoolReference: u64 = 10;
    const EPriceStale: u64 = 11;

    // ====== Constants ======
    const OPTION_TYPE_CALL: u8 = 0;
    const OPTION_TYPE_PUT: u8 = 1;
    
    // Price precision (9 decimals to match DeepBook)
    const PRICE_DECIMALS: u64 = 1_000_000_000;
    
    // Maximum price staleness in milliseconds (5 minutes)
    const MAX_PRICE_STALENESS_MS: u64 = 300_000;

    // ====== Structs ======

    /// One-time witness for module initialization
    public struct OPTIONS_POOL has drop {}

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Represents an options pool for a specific strike/expiry combination
    /// BaseAsset is the underlying asset (e.g., SUI, BTC, ETH)
    /// QuoteAsset is the quote currency (e.g., USDC, USDT)
    /// 
    /// For Call Options:
    /// - Seller deposits BaseAsset as collateral
    /// - Buyer pays QuoteAsset premium
    /// - At exercise: Buyer gets BaseAsset, Seller gets QuoteAsset at strike price
    /// 
    /// For Put Options:
    /// - Seller deposits QuoteAsset as collateral (strike_price * amount)
    /// - Buyer pays QuoteAsset premium
    /// - At exercise: Buyer sells BaseAsset at strike price, gets QuoteAsset
    public struct OptionsPool<phantom BaseAsset, phantom QuoteAsset> has key {
        id: UID,
        /// Type of option: 0 = Call, 1 = Put
        option_type: u8,
        /// Strike price with PRICE_DECIMALS precision (QuoteAsset per BaseAsset)
        strike_price: u64,
        /// Expiration timestamp in milliseconds
        expiration_date: u64,
        /// Total options minted (in BaseAsset units)
        total_options_minted: u64,
        /// Collateral locked in the pool
        /// For Call: BaseAsset
        /// For Put: QuoteAsset (strike_price * amount in QuoteAsset units)
        collateral_balance_base: Balance<BaseAsset>,
        collateral_balance_quote: Balance<QuoteAsset>,
        /// Current underlying asset price from DeepBook (QuoteAsset per BaseAsset)
        underlying_asset_price: Option<u64>,
        /// Last time price was updated
        last_price_update: u64,
        /// DeepBook pool ID for price oracle
        deepbook_pool_id: ID,
        /// Whether the pool has been settled
        is_settled: bool,
        /// Settlement price (set at expiration)
        settlement_price: Option<u64>,
        /// Total options exercised
        total_options_exercised: u64,
    }

    /// Owner token - represents claim to collateral after settlement
    /// Minted 1:1 with options when collateral is deposited
    public struct OwnerToken<phantom BaseAsset, phantom QuoteAsset> has key, store {
        id: UID,
        /// Amount of owner tokens (in BaseAsset units)
        amount: u64,
        /// Reference to the pool
        pool_id: ID,
    }

    /// Option token - represents the right to exercise
    /// Can be traded on DeepBook
    public struct OptionToken<phantom BaseAsset, phantom QuoteAsset> has key, store {
        id: UID,
        /// Amount of option tokens (in BaseAsset units)
        amount: u64,
        /// Reference to the pool
        pool_id: ID,
    }

    /// Dynamic field key for option metadata
    public struct OptionMetadata has store, copy, drop {
        option_type: u8,
        strike_price: u64,
        expiration_date: u64,
        pool_id: ID,
    }

    // ====== Events ======

    public struct PoolCreated has copy, drop {
        pool_id: ID,
        option_type: u8,
        strike_price: u64,
        expiration_date: u64,
        deepbook_pool_id: ID,
    }

    public struct OptionsMinted has copy, drop {
        pool_id: ID,
        amount: u64,
        collateral_type: u8, // 0 = base, 1 = quote
        collateral_amount: u64,
        minter: address,
    }

    public struct OptionsExercised has copy, drop {
        pool_id: ID,
        amount: u64,
        exerciser: address,
        payout_base: u64,
        payout_quote: u64,
    }

    public struct PriceUpdated has copy, drop {
        pool_id: ID,
        new_price: u64,
        timestamp: u64,
    }

    public struct PoolSettled has copy, drop {
        pool_id: ID,
        settlement_price: u64,
        timestamp: u64,
    }

    public struct CollateralClaimed has copy, drop {
        pool_id: ID,
        owner_tokens_burned: u64,
        collateral_claimed_base: u64,
        collateral_claimed_quote: u64,
        claimer: address,
    }

    // ====== Initialization ======

    fun init(witness: OPTIONS_POOL, ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    // ====== Pool Creation ======

    /// Create a new options pool
    /// The BaseAsset and QuoteAsset are determined by the DeepBook pool
    public fun create_pool<BaseAsset, QuoteAsset>(
        option_type: u8,
        strike_price: u64,
        expiration_date: u64,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        // Validate inputs
        assert!(option_type == OPTION_TYPE_CALL || option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        assert!(strike_price > 0, EInvalidStrikePrice);
        assert!(expiration_date > clock::timestamp_ms(clock), EInvalidExpiration);

        let pool = OptionsPool<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            option_type,
            strike_price,
            expiration_date,
            total_options_minted: 0,
            collateral_balance_base: balance::zero(),
            collateral_balance_quote: balance::zero(),
            underlying_asset_price: option::none(),
            last_price_update: 0,
            deepbook_pool_id,
            is_settled: false,
            settlement_price: option::none(),
            total_options_exercised: 0,
        };

        let pool_id = object::uid_to_inner(&pool.id);

        event::emit(PoolCreated {
            pool_id,
            option_type,
            strike_price,
            expiration_date,
            deepbook_pool_id,
        });

        transfer::share_object(pool);
        pool_id
    }

    // ====== Minting Options ======

    /// Mint call options by depositing BaseAsset as collateral
    /// The seller deposits the underlying asset they're willing to sell
    public fun mint_call_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        collateral: Coin<BaseAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (OptionToken<BaseAsset, QuoteAsset>, OwnerToken<BaseAsset, QuoteAsset>) {
        // Verify this is a call option pool
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);
        
        // Check pool not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        
        let amount = coin::value(&collateral);
        assert!(amount > 0, EZeroAmount);

        // Deposit collateral (BaseAsset for calls)
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut pool.collateral_balance_base, collateral_balance);

        // Update minted count
        pool.total_options_minted = pool.total_options_minted + amount;

        let pool_id = object::uid_to_inner(&pool.id);
        let sender = tx_context::sender(ctx);

        // Create option token
        let mut option_token = OptionToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount,
            pool_id,
        };

        // Add metadata as dynamic field
        let metadata = OptionMetadata {
            option_type: pool.option_type,
            strike_price: pool.strike_price,
            expiration_date: pool.expiration_date,
            pool_id,
        };
        df::add(&mut option_token.id, b"metadata", metadata);

        // Create owner token
        let owner_token = OwnerToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount,
            pool_id,
        };

        event::emit(OptionsMinted {
            pool_id,
            amount,
            collateral_type: 0, // base
            collateral_amount: amount,
            minter: sender,
        });

        (option_token, owner_token)
    }

    /// Mint put options by depositing QuoteAsset as collateral
    /// The seller deposits quote currency (e.g., USDC) to buy the underlying if exercised
    /// Collateral needed = strike_price * amount (in QuoteAsset terms)
    public fun mint_put_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        collateral: Coin<QuoteAsset>,
        amount: u64, // Amount of put options to mint (in BaseAsset units)
        clock: &Clock,
        ctx: &mut TxContext,
    ): (OptionToken<BaseAsset, QuoteAsset>, OwnerToken<BaseAsset, QuoteAsset>) {
        // Verify this is a put option pool
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        
        // Check pool not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        assert!(amount > 0, EZeroAmount);

        // Calculate required collateral: strike_price * amount / PRICE_DECIMALS
        // Since strike_price is in QuoteAsset per BaseAsset with PRICE_DECIMALS precision
        let required_collateral = (pool.strike_price * amount) / PRICE_DECIMALS;
        let provided_collateral = coin::value(&collateral);
        
        assert!(provided_collateral >= required_collateral, EInsufficientCollateral);

        // Deposit collateral (QuoteAsset for puts)
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut pool.collateral_balance_quote, collateral_balance);

        // Update minted count (in BaseAsset units)
        pool.total_options_minted = pool.total_options_minted + amount;

        let pool_id = object::uid_to_inner(&pool.id);
        let sender = tx_context::sender(ctx);

        // Create option token
        let mut option_token = OptionToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount,
            pool_id,
        };

        // Add metadata as dynamic field
        let metadata = OptionMetadata {
            option_type: pool.option_type,
            strike_price: pool.strike_price,
            expiration_date: pool.expiration_date,
            pool_id,
        };
        df::add(&mut option_token.id, b"metadata", metadata);

        // Create owner token
        let owner_token = OwnerToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount,
            pool_id,
        };

        event::emit(OptionsMinted {
            pool_id,
            amount,
            collateral_type: 1, // quote
            collateral_amount: provided_collateral,
            minter: sender,
        });

        (option_token, owner_token)
    }

    // ====== Price Update (Oracle) ======

    /// Update the underlying asset price from DeepBook
    /// Fetches the mid-price from the DeepBook pool
    public fun update_price<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        deepbook_pool: &Pool<BaseAsset, QuoteAsset>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        // Check not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        
        // Verify this is the correct DeepBook pool
        assert!(
            object::id(deepbook_pool) == pool.deepbook_pool_id, 
            EInvalidPoolReference
        );

        let mid_price = deepbook::pool::mid_price(deepbook_pool, clock);

        let current_time = clock::timestamp_ms(clock);
        
        // Update price
        pool.underlying_asset_price = option::some(mid_price);
        pool.last_price_update = current_time;

        event::emit(PriceUpdated {
            pool_id: object::uid_to_inner(&pool.id),
            new_price: mid_price,
            timestamp: current_time,
        });
    }

    /// Manual price update (for testing or emergency use with admin cap)
    public fun update_price_manual<BaseAsset, QuoteAsset>(
        _admin: &AdminCap,
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        price: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        
        pool.underlying_asset_price = option::some(price);
        pool.last_price_update = clock::timestamp_ms(clock);

        event::emit(PriceUpdated {
            pool_id: object::uid_to_inner(&pool.id),
            new_price: price,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ====== Exercise Options (American Style) ======

    /// Exercise call options before expiration (American style)
    /// Buyer provides QuoteAsset payment, receives BaseAsset
    public fun exercise_call_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        option_token: OptionToken<BaseAsset, QuoteAsset>,
        payment: Coin<QuoteAsset>, // Payment at strike price
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<BaseAsset> {
        // Verify this is a call option pool
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);
        
        // Check not expired and not settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < pool.expiration_date, EPoolExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = option_token.amount;
        assert!(amount > 0, EZeroAmount);

        // Check price is fresh
        assert!(option::is_some(&pool.underlying_asset_price), EPriceNotSet);
        assert!(
            current_time - pool.last_price_update <= MAX_PRICE_STALENESS_MS,
            EPriceStale
        );

        let current_price = *option::borrow(&pool.underlying_asset_price);
        
        // Call is only exercisable if current_price > strike_price (in the money)
        assert!(current_price > pool.strike_price, EOptionNotExercisable);

        // Calculate required payment: strike_price * amount / PRICE_DECIMALS
        let required_payment = (pool.strike_price * amount) / PRICE_DECIMALS;
        assert!(coin::value(&payment) >= required_payment, EInsufficientCollateral);

        // Deposit payment into pool
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut pool.collateral_balance_quote, payment_balance);

        // Update exercised count
        pool.total_options_exercised = pool.total_options_exercised + amount;

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer BaseAsset to exerciser
        assert!(balance::value(&pool.collateral_balance_base) >= amount, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_base, amount);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: amount,
            payout_quote: 0,
        });

        payout_coin
    }

    /// Exercise put options before expiration (American style)
    /// Buyer provides BaseAsset, receives QuoteAsset at strike price
    public fun exercise_put_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        option_token: OptionToken<BaseAsset, QuoteAsset>,
        base_asset: Coin<BaseAsset>, // BaseAsset to sell
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<QuoteAsset> {
        // Verify this is a put option pool
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        
        // Check not expired and not settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < pool.expiration_date, EPoolExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = option_token.amount;
        assert!(amount > 0, EZeroAmount);

        // Check price is fresh
        assert!(option::is_some(&pool.underlying_asset_price), EPriceNotSet);
        assert!(
            current_time - pool.last_price_update <= MAX_PRICE_STALENESS_MS,
            EPriceStale
        );

        let current_price = *option::borrow(&pool.underlying_asset_price);
        
        // Put is only exercisable if current_price < strike_price (in the money)
        assert!(current_price < pool.strike_price, EOptionNotExercisable);

        // Verify sufficient BaseAsset provided
        assert!(coin::value(&base_asset) >= amount, EInsufficientCollateral);

        // Deposit BaseAsset into pool
        let base_balance = coin::into_balance(base_asset);
        balance::join(&mut pool.collateral_balance_base, base_balance);

        // Calculate payout: strike_price * amount / PRICE_DECIMALS
        let payout = (pool.strike_price * amount) / PRICE_DECIMALS;

        // Update exercised count
        pool.total_options_exercised = pool.total_options_exercised + amount;

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer QuoteAsset to exerciser
        assert!(balance::value(&pool.collateral_balance_quote) >= payout, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_quote, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: 0,
            payout_quote: payout,
        });

        payout_coin
    }

    // ====== Settlement ======

    /// Settle the pool after expiration
    /// Fetches final price from DeepBook and locks in settlement
    public fun settle_pool<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        deepbook_pool: &Pool<BaseAsset, QuoteAsset>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        // Check expired and not already settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= pool.expiration_date, EPoolNotExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        // Verify this is the correct DeepBook pool
        assert!(
            object::id(deepbook_pool) == pool.deepbook_pool_id, 
            EInvalidPoolReference
        );

        pool.is_settled = true;

        event::emit(PoolSettled {
            pool_id: object::uid_to_inner(&pool.id),
            settlement_price: *option::borrow(&pool.underlying_asset_price),
            timestamp: current_time,
        });
    }

    // ====== Claim After Settlement ======

    /// Claim collateral with owner tokens after settlement (for call options)
    /// Call writers receive:
    /// - BaseAsset if out of the money (price <= strike)
    /// - QuoteAsset if in the money (price > strike) from exercises
    public fun claim_collateral_call<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        owner_token: OwnerToken<BaseAsset, QuoteAsset>,
        ctx: &mut TxContext,
    ): (Coin<BaseAsset>, Coin<QuoteAsset>) {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);

        // Verify owner token belongs to this pool
        assert!(owner_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = owner_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Calculate claimable amounts
        let (claimable_base, claimable_quote) = if (settlement_price <= pool.strike_price) {
            // Out of the money - writer keeps BaseAsset
            (amount, 0u64)
        } else {
            // In the money - writer gets QuoteAsset from exercises
            // Amount of quote per option = strike_price / PRICE_DECIMALS
            let quote_per_option = pool.strike_price / PRICE_DECIMALS;
            (0u64, amount * quote_per_option)
        };

        // Burn owner token
        let OwnerToken { id, amount: _, pool_id: _ } = owner_token;
        object::delete(id);

        // Create return coins
        let base_coin = if (claimable_base > 0) {
            let claim_balance = balance::split(&mut pool.collateral_balance_base, claimable_base);
            coin::from_balance(claim_balance, ctx)
        } else {
            coin::zero(ctx)
        };

        let quote_coin = if (claimable_quote > 0) {
            let claim_balance = balance::split(&mut pool.collateral_balance_quote, claimable_quote);
            coin::from_balance(claim_balance, ctx)
        } else {
            coin::zero(ctx)
        };

        event::emit(CollateralClaimed {
            pool_id: object::uid_to_inner(&pool.id),
            owner_tokens_burned: amount,
            collateral_claimed_base: claimable_base,
            collateral_claimed_quote: claimable_quote,
            claimer: tx_context::sender(ctx),
        });

        (base_coin, quote_coin)
    }

    /// Claim collateral with owner tokens after settlement (for put options)
    /// Put writers receive:
    /// - QuoteAsset if out of the money (price >= strike)
    /// - BaseAsset if in the money (price < strike) from exercises
    public fun claim_collateral_put<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        owner_token: OwnerToken<BaseAsset, QuoteAsset>,
        ctx: &mut TxContext,
    ): (Coin<BaseAsset>, Coin<QuoteAsset>) {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);

        // Verify owner token belongs to this pool
        assert!(owner_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = owner_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Calculate claimable amounts
        let (claimable_base, claimable_quote) = if (settlement_price >= pool.strike_price) {
            // Out of the money - writer keeps QuoteAsset
            let quote_per_option = pool.strike_price / PRICE_DECIMALS;
            (0u64, amount * quote_per_option)
        } else {
            // In the money - writer gets BaseAsset from exercises
            (amount, 0u64)
        };

        // Burn owner token
        let OwnerToken { id, amount: _, pool_id: _ } = owner_token;
        object::delete(id);

        // Create return coins
        let base_coin = if (claimable_base > 0) {
            let claim_balance = balance::split(&mut pool.collateral_balance_base, claimable_base);
            coin::from_balance(claim_balance, ctx)
        } else {
            coin::zero(ctx)
        };

        let quote_coin = if (claimable_quote > 0) {
            let claim_balance = balance::split(&mut pool.collateral_balance_quote, claimable_quote);
            coin::from_balance(claim_balance, ctx)
        } else {
            coin::zero(ctx)
        };

        event::emit(CollateralClaimed {
            pool_id: object::uid_to_inner(&pool.id),
            owner_tokens_burned: amount,
            collateral_claimed_base: claimable_base,
            collateral_claimed_quote: claimable_quote,
            claimer: tx_context::sender(ctx),
        });

        (base_coin, quote_coin)
    }

    /// Claim with call option tokens after settlement (if in the money)
    /// Option holders can claim by paying strike price
    public fun claim_with_call_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        option_token: OptionToken<BaseAsset, QuoteAsset>,
        payment: Coin<QuoteAsset>, // Payment at strike price
        ctx: &mut TxContext,
    ): Coin<BaseAsset> {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = option_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Can only claim if in the money
        assert!(settlement_price > pool.strike_price, EOptionNotExercisable);

        // Calculate required payment
        let required_payment = (pool.strike_price * amount) / PRICE_DECIMALS;
        assert!(coin::value(&payment) >= required_payment, EInsufficientCollateral);

        // Deposit payment
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut pool.collateral_balance_quote, payment_balance);

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer BaseAsset
        assert!(balance::value(&pool.collateral_balance_base) >= amount, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_base, amount);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: amount,
            payout_quote: 0,
        });

        payout_coin
    }

    /// Claim with put option tokens after settlement (if in the money)
    /// Option holders provide BaseAsset and receive QuoteAsset at strike price
    public fun claim_with_put_options<BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
        option_token: OptionToken<BaseAsset, QuoteAsset>,
        base_asset: Coin<BaseAsset>,
        ctx: &mut TxContext,
    ): Coin<QuoteAsset> {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = option_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Can only claim if in the money
        assert!(settlement_price < pool.strike_price, EOptionNotExercisable);

        // Verify sufficient BaseAsset provided
        assert!(coin::value(&base_asset) >= amount, EInsufficientCollateral);

        // Deposit BaseAsset
        let base_balance = coin::into_balance(base_asset);
        balance::join(&mut pool.collateral_balance_base, base_balance);

        // Calculate payout
        let payout = (pool.strike_price * amount) / PRICE_DECIMALS;

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer QuoteAsset
        assert!(balance::value(&pool.collateral_balance_quote) >= payout, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_quote, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: 0,
            payout_quote: payout,
        });

        payout_coin
    }

    // ====== View Functions ======

    public fun get_pool_info<BaseAsset, QuoteAsset>(
        pool: &OptionsPool<BaseAsset, QuoteAsset>,
    ): (u8, u64, u64, u64, u64, u64, bool, Option<u64>) {
        (
            pool.option_type,
            pool.strike_price,
            pool.expiration_date,
            pool.total_options_minted,
            balance::value(&pool.collateral_balance_base),
            balance::value(&pool.collateral_balance_quote),
            pool.is_settled,
            pool.settlement_price,
        )
    }

    public fun get_current_price<BaseAsset, QuoteAsset>(
        pool: &OptionsPool<BaseAsset, QuoteAsset>,
    ): (Option<u64>, u64) {
        (pool.underlying_asset_price, pool.last_price_update)
    }

    public fun get_option_token_amount<BaseAsset, QuoteAsset>(
        token: &OptionToken<BaseAsset, QuoteAsset>,
    ): u64 {
        token.amount
    }

    public fun get_owner_token_amount<BaseAsset, QuoteAsset>(
        token: &OwnerToken<BaseAsset, QuoteAsset>,
    ): u64 {
        token.amount
    }

    public fun get_deepbook_pool_id<BaseAsset, QuoteAsset>(
        pool: &OptionsPool<BaseAsset, QuoteAsset>,
    ): ID {
        pool.deepbook_pool_id
    }

    // ====== Token Merging/Splitting ======

    public fun merge_option_tokens<BaseAsset, QuoteAsset>(
        token1: &mut OptionToken<BaseAsset, QuoteAsset>,
        token2: OptionToken<BaseAsset, QuoteAsset>,
    ) {
        assert!(token1.pool_id == token2.pool_id, EInvalidPoolReference);
        let OptionToken { id, amount, pool_id: _ } = token2;
        token1.amount = token1.amount + amount;
        object::delete(id);
    }

    public fun merge_owner_tokens<BaseAsset, QuoteAsset>(
        token1: &mut OwnerToken<BaseAsset, QuoteAsset>,
        token2: OwnerToken<BaseAsset, QuoteAsset>,
    ) {
        assert!(token1.pool_id == token2.pool_id, EInvalidPoolReference);
        let OwnerToken { id, amount, pool_id: _ } = token2;
        token1.amount = token1.amount + amount;
        object::delete(id);
    }

    public fun split_option_token<BaseAsset, QuoteAsset>(
        token: &mut OptionToken<BaseAsset, QuoteAsset>,
        split_amount: u64,
        ctx: &mut TxContext,
    ): OptionToken<BaseAsset, QuoteAsset> {
        assert!(token.amount >= split_amount, EInsufficientCollateral);
        token.amount = token.amount - split_amount;

        OptionToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount: split_amount,
            pool_id: token.pool_id,
        }
    }

    public fun split_owner_token<BaseAsset, QuoteAsset>(
        token: &mut OwnerToken<BaseAsset, QuoteAsset>,
        split_amount: u64,
        ctx: &mut TxContext,
    ): OwnerToken<BaseAsset, QuoteAsset> {
        assert!(token.amount >= split_amount, EInsufficientCollateral);
        token.amount = token.amount - split_amount;

        OwnerToken<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            amount: split_amount,
            pool_id: token.pool_id,
        }
    }

    // ====== Test-only Functions ======
    
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(OPTIONS_POOL {}, ctx);
    }
}