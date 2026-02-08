// Example option token module for PUT option on SUI/USDC with strike 1500
// This demonstrates how to create a PUT option token and pool

module varuna::put_deep_sui_30000000_exp20270101 {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::option;
    use sui::object::ID;
    use varuna::options_pool;

    /// One-Time Witness for this specific option token
    /// Must be named after the module in all uppercase
    public struct PUT_DEEP_SUI_30000000_EXP20270101 has drop {}

    // Constants for this option
    const STRIKE_PRICE: u64 = 30_000_000; 
    const EXPIRATION_DATE: u64 = 1798761600000; // Example: Jan 1, 2025 00:00:00 UTC in milliseconds

    /// Initialize the option token and create the pool
    /// This runs exactly once when the module is published
    fun init(witness: PUT_DEEP_SUI_30000000_EXP20270101, ctx: &mut TxContext) {
        // Create the currency with the One-Time Witness
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                      // decimals (9 for Sui standard)
            b"PUT-DEEP-SUI-30000000-EXP20270101",                  // symbol
            b"PUT Option DEEP/SUI Strike 30000000",    // name
            b"Decentralized PUT option with strike 0.03 SUI per DEEP", // description
            option::none(),                         // icon URL
            ctx
        );

        // Freeze the metadata so it can't be changed
        transfer::public_freeze_object(metadata);

        // Transfer treasury_cap to the publisher
        // They will need to call create_pool with this treasury_cap
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Helper function to create the pool (must be called after init by the treasury_cap holder)
    /// This should be called in a separate transaction after publishing the module
    public fun create_pool<DEEP, SUI>(
        treasury_cap: TreasuryCap<PUT_DEEP_SUI_30000000_EXP20270101>,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        options_pool::create_pool<PUT_DEEP_SUI_30000000_EXP20270101, DEEP, SUI>(
            treasury_cap,
            1, // OPTION_TYPE_PUT
            STRIKE_PRICE,
            EXPIRATION_DATE,
            deepbook_pool_id,
            clock,
            ctx,
        )
    }

    // ====== Test-only Functions ======
    
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(PUT_DEEP_SUI_30000000_EXP20270101 {}, ctx);
    }
}
