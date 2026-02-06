// File: tests/call_option_test.move
// Test module for a generic CALL option token with OTW pattern

#[test_only]
module varuna::call_option_test {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::transfer;
    use std::option;

    /// One-time witness for this specific test option token
    public struct CALL_OPTION has drop {}

    /// Initialize the CALL option currency for testing
    /// Mints no initial supply; TreasuryCap is transferred to ADMIN (@0xAD)
    public fun init_currency(scenario: &mut Scenario) {
        ts::next_tx(scenario, @0xAD);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                CALL_OPTION {},
                9,
                b"CALL-TEST",
                b"CALL Test Option",
                b"Test CALL option token for options_pool",
                option::none(),
                ctx,
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, @0xAD);
        };
    }
}

