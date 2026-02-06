// File: tests/sui.move
// Test module for SUI coin with proper one-time witness

#[test_only]
module varuna::sui {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::transfer;
    use std::option;
    
    // One-time witness - must match module name (uppercase)
    public struct SUI has drop {}
    
    /// Initialize SUI currency for testing
    public fun init_currency(scenario: &mut Scenario) {
        ts::next_tx(scenario, @0xAD);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                SUI {},
                9,
                b"SUI",
                b"Sui Token",
                b"Mock Sui token for testing",
                option::none(),
                ctx
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, @0xAD);
        };
    }
}
