// File: sources/options_pool.move
//
// Single-token options pool contract for Sui
// This contract manages a pool for ONE specific option token type
// Each option type needs its own instance of this pool

module varuna::options_pool {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use std::option::{Self, Option};
    use sui::event;
    use std::string::{Self, String};
    
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
    const ENotAuthorized: u64 = 12;
    const ETokenSupplyNotZero: u64 = 13;

    // ====== Constants ======
    const OPTION_TYPE_CALL: u8 = 0;
    const OPTION_TYPE_PUT: u8 = 1;
    
    // Price precision (9 decimals to match DeepBook)
    const PRICE_DECIMALS: u64 = 1_000_000_000;
    
    // Maximum price staleness in milliseconds (5 minutes)
    const MAX_PRICE_STALENESS_MS: u64 = 300_000;
    
    // Default decimals for option tokens
    const OPTION_TOKEN_DECIMALS: u8 = 9;

    // ====== Structs ======

    /// One-time witness for module initialization
    public struct OPTIONS_POOL has drop {}

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Represents an options pool for a specific strike/expiry combination
    /// The option tokens are standard Coin<OptionToken> that can be traded on DeepBook
    /// 
    /// Type Parameters:
    /// - OptionToken: The specific option token type (must have drop ability for OTW pattern)
    /// - BaseAsset: The underlying asset
    /// - QuoteAsset: The quote/payment asset
    /// 
    /// For Call Options:
    /// - Seller deposits BaseAsset as collateral
    /// - Mints OptionToken coins (supply increases)
    /// - Option holders can exercise by paying QuoteAsset to receive BaseAsset
    /// 
    /// For Put Options:
    /// - Seller deposits QuoteAsset as collateral (strike_price * amount)
    /// - Mints OptionToken coins (supply increases)
    /// - Option holders can exercise by providing BaseAsset to receive QuoteAsset
    public struct OptionsPool<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset> has key {
        id: UID,
        /// Type of option: 0 = Call, 1 = Put
        option_type: u8,
        /// Strike price with PRICE_DECIMALS precision (QuoteAsset per BaseAsset)
        strike_price: u64,
        /// Expiration timestamp in milliseconds
        expiration_date: u64,
        /// Total options minted (in BaseAsset units)
        /// This represents the total supply of OptionToken
        total_options_minted: u64,
        /// Treasury capability for minting/burning option tokens
        treasury_cap: TreasuryCap<OptionToken>,
        /// Collateral locked in the pool
        /// For Call: BaseAsset (the underlying asset)
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

    /// Owner token - represents claim to residual collateral after settlement
    /// Minted 1:1 with option tokens when collateral is deposited
    /// This is NOT a Coin type as it doesn't need to be traded
    public struct OwnerToken<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset> has key, store {
        id: UID,
        /// Amount of owner tokens (in BaseAsset units)
        amount: u64,
        /// Reference to the pool
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
        total_supply: u64,
    }

    public struct OptionsExercised has copy, drop {
        pool_id: ID,
        amount: u64,
        exerciser: address,
        payout_base: u64,
        payout_quote: u64,
        total_supply: u64,
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

    /// Create a new options pool with a specific option token type
    /// The option token must be created separately using the One-Time Witness pattern
    /// 
    /// IMPORTANT: The TreasuryCap must have zero supply - no tokens should be pre-minted
    /// before collateral is deposited. This ensures all options are fully collateralized.
    /// 
    /// Parameters:
    /// - treasury_cap: TreasuryCap for the option token (obtained from init function)
    /// - option_type: OPTION_TYPE_CALL (0) or OPTION_TYPE_PUT (1)
    /// - strike_price: Strike price in QuoteAsset per BaseAsset with PRICE_DECIMALS precision
    /// - expiration_date: Unix timestamp in milliseconds
    /// - deepbook_pool_id: ID of the DeepBook pool for price oracle
    /// 
    /// Example:
    /// ```
    /// // In your option token module:
    /// fun init(witness: MY_OPTION_TOKEN, ctx: &mut TxContext) {
    ///     let (treasury_cap, metadata) = coin::create_currency(
    ///         witness, 9, b"CALL-SUI-USDC-2000", ...
    ///     );
    ///     transfer::public_freeze_object(metadata);
    ///     // Pass treasury_cap to create_pool (no pre-minting!)
    /// }
    /// ```
    public fun create_pool<OptionToken, BaseAsset, QuoteAsset>(
        treasury_cap: TreasuryCap<OptionToken>,
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
        
        // CRITICAL: Ensure no tokens were pre-minted before collateral is provided
        // This guarantees all option tokens are fully backed by collateral
        assert!(coin::total_supply(&treasury_cap) == 0, ETokenSupplyNotZero);

        // Create the pool
        let pool = OptionsPool<OptionToken, BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            option_type,
            strike_price,
            expiration_date,
            total_options_minted: 0,
            treasury_cap,
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

    // ====== Minting Options (Increases Supply) ======

    /// Mint call options by depositing BaseAsset as collateral
    /// This INCREASES the total supply of option tokens
    /// Returns: (option_coins: Coin<OptionToken>, owner_token: OwnerToken)
    public fun mint_call_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        collateral: Coin<BaseAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Coin<OptionToken>, OwnerToken<OptionToken, BaseAsset, QuoteAsset>) {
        // Verify this is a call option pool
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);
        
        // Check pool not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        
        let amount = coin::value(&collateral);
        assert!(amount > 0, EZeroAmount);

        // Deposit collateral (BaseAsset for calls)
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut pool.collateral_balance_base, collateral_balance);

        // Mint option tokens - THIS INCREASES THE SUPPLY
        let option_coins = coin::mint(&mut pool.treasury_cap, amount, ctx);

        // Update minted count
        pool.total_options_minted = pool.total_options_minted + amount;

        let pool_id = object::uid_to_inner(&pool.id);
        let sender = tx_context::sender(ctx);

        // Create owner token (1:1 with options)
        let owner_token = OwnerToken<OptionToken, BaseAsset, QuoteAsset> {
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
            total_supply: pool.total_options_minted,
        });

        (option_coins, owner_token)
    }

    /// Mint put options by depositing QuoteAsset as collateral
    /// This INCREASES the total supply of option tokens
    /// 
    /// Parameters:
    /// - collateral: QuoteAsset coins to deposit
    /// - amount: Number of put options to mint (in BaseAsset units)
    public fun mint_put_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        collateral: Coin<QuoteAsset>,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Coin<OptionToken>, OwnerToken<OptionToken, BaseAsset, QuoteAsset>) {
        // Verify this is a put option pool
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        
        // Check pool not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        assert!(amount > 0, EZeroAmount);

        // Calculate required collateral: strike_price * amount / PRICE_DECIMALS
        // For put options, collateral is in QuoteAsset
        let required_collateral = (pool.strike_price * amount) / PRICE_DECIMALS;
        let provided_collateral = coin::value(&collateral);
        
        assert!(provided_collateral >= required_collateral, EInsufficientCollateral);

        // Deposit collateral (QuoteAsset for puts)
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut pool.collateral_balance_quote, collateral_balance);

        // Mint option tokens - THIS INCREASES THE SUPPLY
        let option_coins = coin::mint(&mut pool.treasury_cap, amount, ctx);

        // Update minted count (in BaseAsset units)
        pool.total_options_minted = pool.total_options_minted + amount;

        let pool_id = object::uid_to_inner(&pool.id);
        let sender = tx_context::sender(ctx);

        // Create owner token (1:1 with options)
        let owner_token = OwnerToken<OptionToken, BaseAsset, QuoteAsset> {
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
            total_supply: pool.total_options_minted,
        });

        (option_coins, owner_token)
    }

    // ====== Price Update (Oracle) ======

    /// Update the underlying asset price from DeepBook
    /// Fetches the mid-price from the DeepBook pool
    /// Anyone can call this to keep the price updated
    public fun update_price<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
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
        // Update price
        pool.underlying_asset_price = option::some(mid_price);
        pool.last_price_update = clock::timestamp_ms(clock);

        event::emit(PriceUpdated {
            pool_id: object::uid_to_inner(&pool.id),
            new_price: mid_price,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Manual price update (for testing or emergency use with admin cap)
    public fun update_price_manual<OptionToken, BaseAsset, QuoteAsset>(
        _admin: &AdminCap,
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
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

    // ====== Exercise Options (American Style - Decreases Supply) ======

    /// Exercise call options before expiration
    /// Burns option coins (DECREASES SUPPLY) and returns BaseAsset
    /// 
    /// Parameters:
    /// - option_coins: OptionToken coins to exercise
    /// - payment: QuoteAsset payment at strike price
    public fun exercise_call_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        option_coins: Coin<OptionToken>,
        payment: Coin<QuoteAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<BaseAsset> {
        // Verify this is a call option pool
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);
        
        // Check not expired and not settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < pool.expiration_date, EPoolExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        let amount = coin::value(&option_coins);
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

        // Burn option tokens - THIS DECREASES THE SUPPLY
        coin::burn(&mut pool.treasury_cap, option_coins);

        // Transfer BaseAsset to exerciser
        assert!(balance::value(&pool.collateral_balance_base) >= amount, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_base, amount);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        let total_supply = coin::total_supply(&pool.treasury_cap);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: amount,
            payout_quote: 0,
            total_supply,
        });

        payout_coin
    }

    /// Exercise put options before expiration
    /// Burns option coins (DECREASES SUPPLY) and returns QuoteAsset
    /// 
    /// Parameters:
    /// - option_coins: OptionToken coins to exercise
    /// - base_asset: BaseAsset to sell at strike price
    public fun exercise_put_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        option_coins: Coin<OptionToken>,
        base_asset: Coin<BaseAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<QuoteAsset> {
        // Verify this is a put option pool
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        
        // Check not expired and not settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < pool.expiration_date, EPoolExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        let amount = coin::value(&option_coins);
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

        // Deposit BaseAsset
        let base_balance = coin::into_balance(base_asset);
        balance::join(&mut pool.collateral_balance_base, base_balance);

        // Calculate payout: strike_price * amount / PRICE_DECIMALS
        let payout = (pool.strike_price * amount) / PRICE_DECIMALS;

        // Update exercised count
        pool.total_options_exercised = pool.total_options_exercised + amount;

        // Burn option tokens - THIS DECREASES THE SUPPLY
        coin::burn(&mut pool.treasury_cap, option_coins);

        // Transfer QuoteAsset
        assert!(balance::value(&pool.collateral_balance_quote) >= payout, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_quote, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        let total_supply = coin::total_supply(&pool.treasury_cap);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: 0,
            payout_quote: payout,
            total_supply,
        });

        payout_coin
    }

    // ====== Settlement ======

    /// Settle the pool after expiration
    /// Fetches final price from DeepBook and locks in settlement
    /// Anyone can call this after expiration
    public fun settle_pool<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
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

        let settlement_price = *option::borrow(&pool.underlying_asset_price);
        pool.underlying_asset_price = option::some(settlement_price);
        pool.is_settled = true;

        event::emit(PoolSettled {
            pool_id: object::uid_to_inner(&pool.id),
            settlement_price,
            timestamp: current_time,
        });
    }

    // ====== Claim After Settlement ======

    /// Claim collateral with owner tokens after settlement (for call options)
    /// Call option writers receive:
    /// - BaseAsset if out of the money (settlement_price <= strike)
    /// - QuoteAsset if in the money (settlement_price > strike) from exercises
    public fun claim_collateral_call<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        owner_token: OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
        ctx: &mut TxContext,
    ): (Coin<BaseAsset>, Coin<QuoteAsset>) {
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);
        assert!(owner_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = owner_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

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
    /// Put option writers receive:
    /// - QuoteAsset if out of the money (settlement_price >= strike)
    /// - BaseAsset if in the money (settlement_price < strike) from exercises
    public fun claim_collateral_put<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        owner_token: OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
        ctx: &mut TxContext,
    ): (Coin<BaseAsset>, Coin<QuoteAsset>) {
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);
        assert!(owner_token.pool_id == object::uid_to_inner(&pool.id), EInvalidPoolReference);

        let amount = owner_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

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

    /// Claim with call option coins after settlement (if in the money)
    /// Burns option coins (DECREASES SUPPLY) and returns BaseAsset
    public fun claim_with_call_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        option_coins: Coin<OptionToken>,
        payment: Coin<QuoteAsset>,
        ctx: &mut TxContext,
    ): Coin<BaseAsset> {
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_CALL, EInvalidOptionType);

        let amount = coin::value(&option_coins);
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Can only claim if in the money
        assert!(settlement_price > pool.strike_price, EOptionNotExercisable);

        // Calculate required payment
        let required_payment = (pool.strike_price * amount) / PRICE_DECIMALS;
        assert!(coin::value(&payment) >= required_payment, EInsufficientCollateral);

        // Deposit payment
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut pool.collateral_balance_quote, payment_balance);

        // Burn option tokens - DECREASES SUPPLY
        coin::burn(&mut pool.treasury_cap, option_coins);

        // Transfer BaseAsset
        assert!(balance::value(&pool.collateral_balance_base) >= amount, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_base, amount);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        let total_supply = coin::total_supply(&pool.treasury_cap);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: amount,
            payout_quote: 0,
            total_supply,
        });

        payout_coin
    }

    /// Claim with put option coins after settlement (if in the money)
    /// Burns option coins (DECREASES SUPPLY) and returns QuoteAsset
    public fun claim_with_put_options<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        option_coins: Coin<OptionToken>,
        base_asset: Coin<BaseAsset>,
        ctx: &mut TxContext,
    ): Coin<QuoteAsset> {
        assert!(pool.is_settled, EPoolNotExpired);
        assert!(pool.option_type == OPTION_TYPE_PUT, EInvalidOptionType);

        let amount = coin::value(&option_coins);
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

        // Burn option tokens - DECREASES SUPPLY
        coin::burn(&mut pool.treasury_cap, option_coins);

        // Transfer QuoteAsset
        assert!(balance::value(&pool.collateral_balance_quote) >= payout, EInsufficientCollateral);
        let payout_balance = balance::split(&mut pool.collateral_balance_quote, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        let total_supply = coin::total_supply(&pool.treasury_cap);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout_base: 0,
            payout_quote: payout,
            total_supply,
        });

        payout_coin
    }

    // ====== View Functions ======

    /// Get comprehensive pool information
    public fun get_pool_info<OptionToken, BaseAsset, QuoteAsset>(
        pool: &OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
    ): (u8, u64, u64, u64, u64, u64, u64, bool, Option<u64>) {
        (
            pool.option_type,
            pool.strike_price,
            pool.expiration_date,
            pool.total_options_minted,
            coin::total_supply(&pool.treasury_cap),
            balance::value(&pool.collateral_balance_base),
            balance::value(&pool.collateral_balance_quote),
            pool.is_settled,
            pool.settlement_price,
        )
    }

    /// Get current price and last update time
    public fun get_current_price<OptionToken, BaseAsset, QuoteAsset>(
        pool: &OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
    ): (Option<u64>, u64) {
        (pool.underlying_asset_price, pool.last_price_update)
    }

    /// Get option token supply
    public fun get_option_supply<OptionToken, BaseAsset, QuoteAsset>(
        pool: &OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
    ): u64 {
        coin::total_supply(&pool.treasury_cap)
    }

    /// Get owner token amount
    public fun get_owner_token_amount<OptionToken, BaseAsset, QuoteAsset>(
        token: &OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
    ): u64 {
        token.amount
    }

    /// Get DeepBook pool ID
    public fun get_deepbook_pool_id<OptionToken, BaseAsset, QuoteAsset>(
        pool: &OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
    ): ID {
        pool.deepbook_pool_id
    }

    // ====== Owner Token Operations ======

    /// Merge two owner tokens from the same pool
    public fun merge_owner_tokens<OptionToken, BaseAsset, QuoteAsset>(
        token1: &mut OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
        token2: OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
    ) {
        assert!(token1.pool_id == token2.pool_id, EInvalidPoolReference);
        let OwnerToken { id, amount, pool_id: _ } = token2;
        token1.amount = token1.amount + amount;
        object::delete(id);
    }

    /// Split an owner token into two
    public fun split_owner_token<OptionToken, BaseAsset, QuoteAsset>(
        token: &mut OwnerToken<OptionToken, BaseAsset, QuoteAsset>,
        split_amount: u64,
        ctx: &mut TxContext,
    ): OwnerToken<OptionToken, BaseAsset, QuoteAsset> {
        assert!(token.amount >= split_amount, EInsufficientCollateral);
        token.amount = token.amount - split_amount;

        OwnerToken<OptionToken, BaseAsset, QuoteAsset> {
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

    /// Test-only helper to directly set the settlement state on a pool.
    /// This is used in unit tests to simulate post-settlement conditions
    /// without going through the full DeepBook integration.
    #[test_only]
    public fun set_settlement_for_testing<OptionToken, BaseAsset, QuoteAsset>(
        pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
        settlement_price: u64,
    ) {
        pool.is_settled = true;
        pool.settlement_price = option::some(settlement_price);
    }
}
