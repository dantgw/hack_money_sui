// Example option token module for CALL option on SUI/USDC with strike 2000
// This demonstrates how to create a specific option token and pool

module varuna::call_sui_usdc_2000 {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::option;
    use sui::object::ID;
    use varuna::options_pool;

    /// One-Time Witness for this specific option token
    /// Must be named after the module in all uppercase
    public struct CALL_SUI_USDC_2000 has drop {}

    // Constants for this option
    const STRIKE_PRICE: u64 = 2_000_000_000_000; // 2000 USDC (with 9 decimals precision)
    const EXPIRATION_DATE: u64 = 1735689600000; // Example: Jan 1, 2025 00:00:00 UTC in milliseconds

    /// Initialize the option token and create the pool
    /// This runs exactly once when the module is published
    fun init(witness: CALL_SUI_USDC_2000, ctx: &mut TxContext) {
        // Create the currency with the One-Time Witness
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                      // decimals (9 for Sui standard)
            b"CALL-SUI-USDC-2000",                 // symbol
            b"CALL Option SUI/USDC Strike 2000",   // name
            b"Decentralized CALL option with strike 2000 USDC per SUI", // description
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
        treasury_cap: TreasuryCap<CALL_SUI_USDC_2000>,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        options_pool::create_pool<CALL_SUI_USDC_2000, SUI, USDC>(
            treasury_cap,
            0, // OPTION_TYPE_CALL
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
        init(CALL_SUI_USDC_2000 {}, ctx);
    }
}
