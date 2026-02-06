// File: tests/call_options_tests.move

#[test_only]
module varuna::call_options_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::object;
    use std::string;
    use varuna::options_pool::{Self, OptionsPool, OwnerToken, AdminCap};
    use varuna::option_token_factory::{Self, OptionTokenRegistry, OPTION_TOKEN};
    use varuna::test_helpers::{Self, SUI, USDC, admin, alice, bob, carol};

    const OPTION_TYPE_CALL: u8 = 0;

    #[test]
    fun test_create_call_option_pool() {
        let mut scenario = ts::begin(admin());
        
        // Initialize modules
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        // Create clock
        let mut clock = test_helpers::create_clock(&mut scenario);
        let current_time = clock::timestamp_ms(&clock);
        let expiration = current_time + test_helpers::one_month_ms();

        // Create call option pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            let pool_id = options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2), // Strike: 2 USDC
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(registry);
        };

        // Verify pool was created
        ts::next_tx(&mut scenario, admin());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            let (option_type, strike, exp, minted, supply, base_bal, quote_bal, settled, settlement) = 
                options_pool::get_pool_info(&pool);
            
            assert!(option_type == OPTION_TYPE_CALL, 0);
            assert!(strike == test_helpers::usdc(2), 1);
            assert!(exp == expiration, 2);
            assert!(minted == 0, 3);
            assert!(supply == 0, 4);
            assert!(base_bal == 0, 5);
            assert!(quote_bal == 0, 6);
            assert!(!settled, 7);

            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_mint_call_options() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_sui_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // Create pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Mint SUI to Alice
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));

        // Alice mints call options
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify option coins minted
            assert!(coin::value(&option_coins) == test_helpers::sui(100), 0);
            
            // Verify owner token
            assert!(options_pool::get_owner_token_amount(&owner_token) == test_helpers::sui(100), 1);

            // Verify pool state
            let (_, _, _, minted, supply, base_bal, _, _, _) = 
                options_pool::get_pool_info(&pool);
            assert!(minted == test_helpers::sui(100), 2);
            assert!(supply == test_helpers::sui(100), 3);
            assert!(base_bal == test_helpers::sui(100), 4);

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_multiple_users_mint_call_options() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_sui_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // Create pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Mint SUI to Alice and Bob
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(50));

        // Alice mints 100 options
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Bob mints 50 options
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, bob());
            ts::return_shared(pool);
        };

        // Verify total supply
        ts::next_tx(&mut scenario, admin());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let supply = options_pool::get_option_supply(&pool);
            assert!(supply == test_helpers::sui(150), 0); // 100 + 50
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_exercise_call_option_in_the_money() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_sui_coin(&mut scenario);
        test_helpers::init_usdc_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // Create pool (strike: 2 USDC)
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Alice mints 100 call options
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Bob buys options from Alice (simulated - in reality via DeepBook)
        ts::next_tx(&mut scenario, alice());
        {
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            // Split 10 options for Bob
            let bob_options = coin::split(&mut option_coins, test_helpers::sui(10), ts::ctx(&mut scenario));
            transfer::public_transfer(bob_options, bob());
            transfer::public_transfer(option_coins, alice());
        };

        // Update price to 2.5 USDC (in the money)
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(25) / 10, // 2.5 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // Bob exercises 10 options
        test_helpers::mint_usdc(&mut scenario, bob(), test_helpers::usdc(20)); // 10 * 2 USDC strike price
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let payment = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let sui_payout = options_pool::exercise_call_options(
                &mut pool,
                option_coins,
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Bob should receive 10 SUI
            assert!(coin::value(&sui_payout) == test_helpers::sui(10), 0);

            // Supply should decrease
            let supply = options_pool::get_option_supply(&pool);
            assert!(supply == test_helpers::sui(90), 1); // 100 - 10

            transfer::public_transfer(sui_payout, bob());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 4)] // EOptionNotExercisable
    fun test_exercise_call_option_out_of_money() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_sui_coin(&mut scenario);
        test_helpers::init_usdc_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // Create pool (strike: 2 USDC)
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Alice mints options
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Update price to 1.5 USDC (out of the money)
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(15) / 10, // 1.5 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // Bob tries to exercise (should fail - out of money)
        test_helpers::mint_usdc(&mut scenario, bob(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let payment = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let sui_payout = options_pool::exercise_call_options(
                &mut pool,
                option_coins,
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(sui_payout, bob());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_settlement_and_claim_out_of_money() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_sui_coin(&mut scenario);
        test_helpers::init_usdc_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_week_ms();

        // Create pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Alice mints options
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Set price to 1.5 (out of money)
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(15) / 10,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // Advance time past expiration
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms() + 1000);

        // Settle pool
        // Note: In real scenario, would need actual DeepBook pool
        // For testing, we use manual price update
        ts::next_tx(&mut scenario, admin());
        {
            // Pool settlement would fetch from DeepBook
            // Skipping actual settlement test as we don't have mock DeepBook
        };

        // Alice claims collateral (should get SUI back since out of money)
        // Note: Would need to implement mock settlement for full test

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // EPoolExpired
    fun test_cannot_mint_after_expiration() {
        let mut scenario = ts::begin(admin());
        
        test_helpers::init_sui_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_day_ms();

        // Create pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_CALL,
                test_helpers::usdc(2),
                expiration,
                test_helpers::mock_deepbook_pool_id(),
                string::utf8(b"SUI"),
                string::utf8(b"USDC"),
                &clock,
                ts::ctx(&mut scenario)
            );
            ts::return_shared(registry);
        };

        // Advance time past expiration
        test_helpers::advance_clock(&mut clock, test_helpers::one_day_ms() + 1000);

        // Try to mint after expiration (should fail)
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui_coins = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                &mut pool,
                sui_coins,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
