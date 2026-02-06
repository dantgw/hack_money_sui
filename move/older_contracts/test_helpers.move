// File: tests/test_helpers.move

#[test_only]
module varuna::test_helpers {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::balance;
    use sui::tx_context::TxContext;
    use sui::clock::{Self, Clock};
    use std::string;

    // Mock coin types for testing
    public struct SUI has drop {}
    public struct USDC has drop {}

    // Test constants
    const ADMIN: address = @0xAD;
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;
    const CAROL: address = @0xCA801;

    const DECIMALS: u8 = 9;
    const PRICE_DECIMALS: u64 = 1_000_000_000;

    // Helper functions

    /// Initialize mock SUI coins for testing
    public fun init_sui_coin(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                SUI {},
                DECIMALS,
                b"SUI",
                b"Sui Token",
                b"Mock Sui token for testing",
                option::none(),
                ctx
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, ADMIN);
        };
    }

    /// Initialize mock USDC coins for testing
    public fun init_usdc_coin(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            let (treasury, metadata) = coin::create_currency(
                USDC {},
                DECIMALS,
                b"USDC",
                b"USD Coin",
                b"Mock USDC for testing",
                option::none(),
                ctx
            );
            transfer::public_freeze_object(metadata);
            transfer::public_transfer(treasury, ADMIN);
        };
    }

    /// Mint SUI coins to an address
    public fun mint_sui(scenario: &mut Scenario, recipient: address, amount: u64) {
        ts::next_tx(scenario, ADMIN);
        {
            let mut treasury = ts::take_from_sender<coin::TreasuryCap<SUI>>(scenario);
            let ctx = ts::ctx(scenario);
            let coins = coin::mint(&mut treasury, amount, ctx);
            transfer::public_transfer(coins, recipient);
            ts::return_to_sender(scenario, treasury);
        };
    }

    /// Mint USDC coins to an address
    public fun mint_usdc(scenario: &mut Scenario, recipient: address, amount: u64) {
        ts::next_tx(scenario, ADMIN);
        {
            let mut treasury = ts::take_from_sender<coin::TreasuryCap<USDC>>(scenario);
            let ctx = ts::ctx(scenario);
            let coins = coin::mint(&mut treasury, amount, ctx);
            transfer::public_transfer(coins, recipient);
            ts::return_to_sender(scenario, treasury);
        };
    }

    /// Create a test clock
    public fun create_clock(scenario: &mut Scenario): Clock {
        ts::next_tx(scenario, ADMIN);
        clock::create_for_testing(ts::ctx(scenario))
    }

    /// Advance clock by milliseconds
    public fun advance_clock(clock: &mut Clock, ms: u64) {
        clock::increment_for_testing(clock, ms);
    }

    /// Create a mock DeepBook pool ID (for testing without actual DeepBook)
    public fun mock_deepbook_pool_id(): object::ID {
        object::id_from_address(@0xDEEBB00C)
    }

    // Getter functions for constants
    public fun admin(): address { ADMIN }
    public fun alice(): address { ALICE }
    public fun bob(): address { BOB }
    public fun carol(): address { CAROL }
    public fun decimals(): u8 { DECIMALS }
    public fun price_decimals(): u64 { PRICE_DECIMALS }

    // Time constants (in milliseconds)
    public fun one_day_ms(): u64 { 86_400_000 }
    public fun one_week_ms(): u64 { 604_800_000 }
    public fun one_month_ms(): u64 { 2_592_000_000 }

    // Amount helpers
    public fun sui(amount: u64): u64 { amount * PRICE_DECIMALS }
    public fun usdc(amount: u64): u64 { amount * PRICE_DECIMALS }
}
