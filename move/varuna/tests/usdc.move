// File: tests/usdc.move
// Test module for USDC coin with proper one-time witness

#[test_only]
module varuna::usdc {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::transfer;
    use std::option;
    
    // One-time witness - must match module name (uppercase)
    public struct USDC has drop {}
    
    /// Initialize USDC currency for testing
    public fun init_currency(scenario: &mut Scenario) {
        ts::next_tx(scenario, @0xAD);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                USDC {},
                9,
                b"USDC",
                b"USD Coin",
                b"Mock USDC for testing",
                option::none(),
                ctx,
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, @0xAD);
        };
    }
}
