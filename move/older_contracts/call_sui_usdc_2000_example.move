// File: option_tokens/call_sui_usdc_2000_example.move
// Example option token module for CALL option on SUI/USDC with strike 2000
// Each option pool must have its own token module like this

module varuna::call_sui_usdc_2000_example {
    use sui::coin;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::option;

    /// One-Time Witness for this specific option token
    /// Must be named after the module in all uppercase
    public struct CALL_SUI_USDC_2000_EXAMPLE has drop {}

    /// Initialize the option token
    /// This runs exactly once when the module is published
    /// The OTW is automatically created and passed here
    fun init(witness: CALL_SUI_USDC_2000_EXAMPLE, ctx: &mut TxContext) {
        // Create the currency with the One-Time Witness
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                      // decimals (9 for Sui standard)
            b"CALL-SUI-USDC-2000-EXAMPLE",         // symbol
            b"CALL Option SUI/USDC Strike 2000",   // name
            b"Decentralized CALL option with strike 2000 USDC per SUI", // description
            option::none(),                         // icon URL
            ctx
        );

        // Freeze the metadata so it can't be changed
        transfer::public_freeze_object(metadata);

        // Transfer treasury_cap to the publisher
        // In production, this should be transferred to the options pool contract
        // or held by a multisig/governance contract
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    // No other functions needed - the TreasuryCap holder controls minting/burning

    // ====== Test-only Functions ======
    
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(CALL_SUI_USDC_2000_EXAMPLE {}, ctx);
    }
}
