// Example option token module for PUT option on SUI/USDC with strike 1500
// This demonstrates how to create a PUT option token and pool

module varuna::put_sui_usdc_1 {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::option;
    use sui::object::ID;
    use varuna::options_pool;

    /// One-Time Witness for this specific option token
    /// Must be named after the module in all uppercase
    public struct PUT_SUI_USDC_1 has drop {}

    // Constants for this option
    const STRIKE_PRICE: u64 = 1_000_000_000; // 1500 USDC (with 9 decimals precision)
    const EXPIRATION_DATE: u64 = 1798761600000; // Example: Jan 1, 2025 00:00:00 UTC in milliseconds

    /// Initialize the option token and create the pool
    /// This runs exactly once when the module is published
    fun init(witness: PUT_SUI_USDC_1, ctx: &mut TxContext) {
        // Create the currency with the One-Time Witness
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                      // decimals (9 for Sui standard)
            b"PUT-SUI-USDC-1",                  // symbol
            b"PUT Option SUI/USDC Strike 1",    // name
            b"Decentralized PUT option with strike 1 USDC per SUI", // description
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
    public fun create_pool<SUI, USDC>(
        treasury_cap: TreasuryCap<PUT_SUI_USDC_1>,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        options_pool::create_pool<PUT_SUI_USDC_1, SUI, USDC>(
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
        init(PUT_SUI_USDC_1 {}, ctx);
    }
}
