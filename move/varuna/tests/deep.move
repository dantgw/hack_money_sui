// Test module for SUI-like coin with proper one-time witness

#[test_only]
module varuna::deep {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::transfer;
    use std::option;

    // One-time witness - must match module name (uppercase)
    public struct DEEP has drop {}

    /// Initialize SUI currency for testing
    public fun init_currency(scenario: &mut Scenario) {
        ts::next_tx(scenario, @0xAD);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                DEEP {},
                9,
                b"DEEP",
                b"Deep Test Coin",
                b"Mock DEEP for testing",
                option::none(),
                ctx,
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, @0xAD);
        };
    }
}

