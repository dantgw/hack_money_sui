// File: sources/options_pool.move

module varuna::options_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field as df;
    use sui::event;
    use deepbook::pool::Pool;

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

    // ====== Constants ======
    const OPTION_TYPE_CALL: u8 = 0;
    const OPTION_TYPE_PUT: u8 = 1;
    
    // Price precision (9 decimals to match common DeFi standards)
    const PRICE_DECIMALS: u64 = 1_000_000_000;

    // ====== Structs ======

    /// One-time witness for module initialization
    public struct OPTIONS_POOL has drop {}

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Represents an options pool for a specific strike/expiry combination
    public struct OptionsPool<phantom UnderlyingCoin, phantom CollateralCoin> has key {
        id: UID,
        /// Type of option: 0 = Call, 1 = Put
        option_type: u8,
        /// Strike price with PRICE_DECIMALS precision
        strike_price: u64,
        /// Expiration timestamp in milliseconds
        expiration_date: u64,
        /// Total options minted (represents the total obligation)
        total_options_minted: u64,
        /// Collateral locked in the pool
        collateral_balance: Balance<CollateralCoin>,
        /// Current underlying asset price (updated periodically)
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
    public struct OwnerToken<phantom UnderlyingCoin, phantom CollateralCoin> has key, store {
        id: UID,
        /// Amount of owner tokens
        amount: u64,
        /// Reference to the pool
        pool_id: ID,
    }

    /// Option token - represents the right to exercise
    /// Can be traded on DeepBook
    public struct OptionToken<phantom UnderlyingCoin, phantom CollateralCoin> has key, store {
        id: UID,
        /// Amount of option tokens
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
        minter: address,
    }

    public struct OptionsExercised has copy, drop {
        pool_id: ID,
        amount: u64,
        exerciser: address,
        payout: u64,
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
        collateral_claimed: u64,
        claimer: address,
    }

    // ====== Initialization ======

    fun init(_witness: OPTIONS_POOL, ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    // ====== Pool Creation ======

    /// Create a new options pool
    public fun create_pool<UnderlyingCoin, CollateralCoin>(
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

        let pool = OptionsPool<UnderlyingCoin, CollateralCoin> {
            id: object::new(ctx),
            option_type,
            strike_price,
            expiration_date,
            total_options_minted: 0,
            collateral_balance: balance::zero(),
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

    /// Mint options by depositing collateral
    /// For covered calls: deposit UnderlyingCoin
    /// For covered puts: deposit stablecoin/base currency
    public fun mint_options<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        collateral: Coin<CollateralCoin>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (OptionToken<UnderlyingCoin, CollateralCoin>, OwnerToken<UnderlyingCoin, CollateralCoin>) {
        // Check pool not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);
        
        let amount = coin::value(&collateral);
        assert!(amount > 0, EZeroAmount);

        // Deposit collateral
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut pool.collateral_balance, collateral_balance);

        // Update minted count
        pool.total_options_minted = pool.total_options_minted + amount;

        let pool_id = object::uid_to_inner(&pool.id);
        let sender = tx_context::sender(ctx);

        // Create option token
        let mut option_token = OptionToken<UnderlyingCoin, CollateralCoin> {
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
        let owner_token = OwnerToken<UnderlyingCoin, CollateralCoin> {
            id: object::new(ctx),
            amount,
            pool_id,
        };

        event::emit(OptionsMinted {
            pool_id,
            amount,
            minter: sender,
        });

        (option_token, owner_token)
    }

    // ====== Price Update (Oracle) ======

    /// Update the underlying asset price from DeepBook
    /// This is a simplified version - you'll need to integrate with actual DeepBook price query
    public fun update_price<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        clock: &Clock,
        // In real implementation, you'd pass DeepBook pool reference
        // deepbook_pool: &deepbook_pool::Pool<UnderlyingCoin, CollateralCoin>,
        _ctx: &mut TxContext,
    ) {
        // Check not expired
        assert!(clock::timestamp_ms(clock) < pool.expiration_date, EPoolExpired);

        // TODO: Query actual price from DeepBook
        // For now, this is a placeholder
        // let price = deepbook_pool::get_mid_price(deepbook_pool);
        
        // Placeholder: In production, replace with actual DeepBook query
        let current_time = clock::timestamp_ms(clock);
        
        // Update price (in real implementation, get from DeepBook)
        // pool.underlying_asset_price = option::some(price);
        pool.last_price_update = current_time;

        // event::emit(PriceUpdated {
        //     pool_id: object::uid_to_inner(&pool.id),
        //     new_price: price,
        //     timestamp: current_time,
        // });
    }

    /// Manual price update (for testing or emergency)
    public fun update_price_manual<UnderlyingCoin, CollateralCoin>(
        _admin: &AdminCap,
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
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

    /// Exercise options before expiration (American style)
    public fun exercise_options<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        option_token: OptionToken<UnderlyingCoin, CollateralCoin>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<CollateralCoin> {
        // Check not expired and not settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < pool.expiration_date, EPoolExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidOptionType);

        let amount = option_token.amount;
        assert!(amount > 0, EZeroAmount);

        // Calculate payout based on current price
        let current_price = *option::borrow(&pool.underlying_asset_price);
        let payout = calculate_exercise_payout(
            pool.option_type,
            pool.strike_price,
            current_price,
            amount,
        );

        assert!(payout > 0, EOptionNotExercisable);
        assert!(balance::value(&pool.collateral_balance) >= payout, EInsufficientCollateral);

        // Update exercised count
        pool.total_options_exercised = pool.total_options_exercised + amount;

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer payout
        let payout_balance = balance::split(&mut pool.collateral_balance, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout,
        });

        payout_coin
    }

    // ====== Settlement ======

    /// Settle the pool after expiration
    public fun settle_pool<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        // Check expired and not already settled
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= pool.expiration_date, EPoolNotExpired);
        assert!(!pool.is_settled, EPoolAlreadySettled);

        // Get settlement price
        assert!(option::is_some(&pool.underlying_asset_price), EPriceNotSet);
        let settlement_price = *option::borrow(&pool.underlying_asset_price);

        pool.settlement_price = option::some(settlement_price);
        pool.is_settled = true;

        event::emit(PoolSettled {
            pool_id: object::uid_to_inner(&pool.id),
            settlement_price,
            timestamp: current_time,
        });
    }

    // ====== Claim After Settlement ======

    /// Claim collateral with owner tokens after settlement
    public fun claim_collateral<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        owner_token: OwnerToken<UnderlyingCoin, CollateralCoin>,
        ctx: &mut TxContext,
    ): Coin<CollateralCoin> {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);

        // Verify owner token belongs to this pool
        assert!(owner_token.pool_id == object::uid_to_inner(&pool.id), EInvalidOptionType);

        let amount = owner_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Calculate how much collateral the owner can claim back
        let claimable = calculate_owner_claimable(
            pool.option_type,
            pool.strike_price,
            settlement_price,
            amount,
        );

        assert!(balance::value(&pool.collateral_balance) >= claimable, EInsufficientCollateral);

        // Burn owner token
        let OwnerToken { id, amount: _, pool_id: _ } = owner_token;
        object::delete(id);

        // Transfer claimable collateral
        let claim_balance = balance::split(&mut pool.collateral_balance, claimable);
        let claim_coin = coin::from_balance(claim_balance, ctx);

        event::emit(CollateralClaimed {
            pool_id: object::uid_to_inner(&pool.id),
            owner_tokens_burned: amount,
            collateral_claimed: claimable,
            claimer: tx_context::sender(ctx),
        });

        claim_coin
    }

    /// Claim with option tokens after settlement (if in the money)
    public fun claim_with_options<UnderlyingCoin, CollateralCoin>(
        pool: &mut OptionsPool<UnderlyingCoin, CollateralCoin>,
        option_token: OptionToken<UnderlyingCoin, CollateralCoin>,
        ctx: &mut TxContext,
    ): Coin<CollateralCoin> {
        // Check settled
        assert!(pool.is_settled, EPoolNotExpired);

        // Verify option belongs to this pool
        assert!(option_token.pool_id == object::uid_to_inner(&pool.id), EInvalidOptionType);

        let amount = option_token.amount;
        let settlement_price = *option::borrow(&pool.settlement_price);

        // Calculate payout
        let payout = calculate_exercise_payout(
            pool.option_type,
            pool.strike_price,
            settlement_price,
            amount,
        );

        assert!(payout > 0, EOptionNotExercisable);
        assert!(balance::value(&pool.collateral_balance) >= payout, EInsufficientCollateral);

        // Burn option token
        let OptionToken { id, amount: _, pool_id: _ } = option_token;
        object::delete(id);

        // Transfer payout
        let payout_balance = balance::split(&mut pool.collateral_balance, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(OptionsExercised {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            exerciser: tx_context::sender(ctx),
            payout,
        });

        payout_coin
    }

    // ====== Helper Functions ======

    /// Calculate payout for exercising options
    fun calculate_exercise_payout(
        option_type: u8,
        strike_price: u64,
        current_price: u64,
        amount: u64,
    ): u64 {
        if (option_type == OPTION_TYPE_CALL) {
            // Call option: payout if current_price > strike_price
            if (current_price > strike_price) {
                // Payout = amount * (current_price - strike_price) / current_price
                // For covered calls with 1:1 collateral, we return the underlying amount
                amount
            } else {
                0
            }
        } else {
            // Put option: payout if current_price < strike_price
            if (current_price < strike_price) {
                // Payout = amount * (strike_price - current_price) / strike_price
                // For covered puts, collateral is in base currency
                let profit_per_unit = strike_price - current_price;
                (amount * profit_per_unit) / strike_price
            } else {
                0
            }
        }
    }

    /// Calculate claimable collateral for owner tokens
    fun calculate_owner_claimable(
        option_type: u8,
        strike_price: u64,
        settlement_price: u64,
        amount: u64,
    ): u64 {
        if (option_type == OPTION_TYPE_CALL) {
            // Call: owner keeps collateral if settlement_price <= strike_price
            if (settlement_price <= strike_price) {
                amount
            } else {
                // If exercised, owner gets nothing (or residual)
                0
            }
        } else {
            // Put: owner keeps collateral if settlement_price >= strike_price
            if (settlement_price >= strike_price) {
                amount
            } else {
                // Calculate residual after option payout
                let payout = (amount * (strike_price - settlement_price)) / strike_price;
                if (amount > payout) {
                    amount - payout
                } else {
                    0
                }
            }
        }
    }

    // ====== View Functions ======

    public fun get_pool_info<UnderlyingCoin, CollateralCoin>(
        pool: &OptionsPool<UnderlyingCoin, CollateralCoin>,
    ): (u8, u64, u64, u64, u64, bool) {
        (
            pool.option_type,
            pool.strike_price,
            pool.expiration_date,
            pool.total_options_minted,
            balance::value(&pool.collateral_balance),
            pool.is_settled,
        )
    }

    public fun get_option_token_amount<UnderlyingCoin, CollateralCoin>(
        token: &OptionToken<UnderlyingCoin, CollateralCoin>,
    ): u64 {
        token.amount
    }

    public fun get_owner_token_amount<UnderlyingCoin, CollateralCoin>(
        token: &OwnerToken<UnderlyingCoin, CollateralCoin>,
    ): u64 {
        token.amount
    }

    // ====== Token Merging/Splitting ======

    public fun merge_option_tokens<UnderlyingCoin, CollateralCoin>(
        token1: &mut OptionToken<UnderlyingCoin, CollateralCoin>,
        token2: OptionToken<UnderlyingCoin, CollateralCoin>,
    ) {
        assert!(token1.pool_id == token2.pool_id, EInvalidOptionType);
        let OptionToken { id, amount, pool_id: _ } = token2;
        token1.amount = token1.amount + amount;
        object::delete(id);
    }

    public fun merge_owner_tokens<UnderlyingCoin, CollateralCoin>(
        token1: &mut OwnerToken<UnderlyingCoin, CollateralCoin>,
        token2: OwnerToken<UnderlyingCoin, CollateralCoin>,
    ) {
        assert!(token1.pool_id == token2.pool_id, EInvalidOptionType);
        let OwnerToken { id, amount, pool_id: _ } = token2;
        token1.amount = token1.amount + amount;
        object::delete(id);
    }

    public fun split_option_token<UnderlyingCoin, CollateralCoin>(
        token: &mut OptionToken<UnderlyingCoin, CollateralCoin>,
        split_amount: u64,
        ctx: &mut TxContext,
    ): OptionToken<UnderlyingCoin, CollateralCoin> {
        assert!(token.amount >= split_amount, EInsufficientCollateral);
        token.amount = token.amount - split_amount;

        OptionToken<UnderlyingCoin, CollateralCoin> {
            id: object::new(ctx),
            amount: split_amount,
            pool_id: token.pool_id,
        }
    }

    public fun split_owner_token<UnderlyingCoin, CollateralCoin>(
        token: &mut OwnerToken<UnderlyingCoin, CollateralCoin>,
        split_amount: u64,
        ctx: &mut TxContext,
    ): OwnerToken<UnderlyingCoin, CollateralCoin> {
        assert!(token.amount >= split_amount, EInsufficientCollateral);
        token.amount = token.amount - split_amount;

        OwnerToken<UnderlyingCoin, CollateralCoin> {
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