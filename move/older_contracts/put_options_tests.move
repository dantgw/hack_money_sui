// File: tests/put_options_tests.move

#[test_only]
module varuna::put_options_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use std::string;
    use varuna::options_pool::{Self, OptionsPool, OwnerToken, AdminCap};
    use varuna::option_token_factory::{Self, OptionTokenRegistry, OPTION_TOKEN};
    use varuna::test_helpers::{Self, SUI, USDC, admin, alice, bob, carol};

    const OPTION_TYPE_PUT: u8 = 1;

    #[test]
    fun test_create_put_option_pool() {
        let mut scenario = ts::begin(admin());
        
        // Initialize modules
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // Create put option pool
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            options_pool::create_pool<SUI, USDC>(
                &mut registry,
                OPTION_TYPE_PUT,
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
            
            let (option_type, strike, _, _, _, _, _, _, _) = 
                options_pool::get_pool_info(&pool);
            
            assert!(option_type == OPTION_TYPE_PUT, 0);
            assert!(strike == test_helpers::usdc(2), 1);

            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_mint_put_options() {
        let mut scenario = ts::begin(admin());
        
        // Setup
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
                OPTION_TYPE_PUT,
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

        // Alice mints put options
        // To mint 100 SUI worth of puts at strike 2 USDC, needs 200 USDC collateral
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100), // Mint 100 SUI worth of puts
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify option coins minted
            assert!(coin::value(&option_coins) == test_helpers::sui(100), 0);
            
            // Verify owner token
            assert!(options_pool::get_owner_token_amount(&owner_token) == test_helpers::sui(100), 1);

            // Verify pool state
            let (_, _, _, minted, supply, base_bal, quote_bal, _, _) = 
                options_pool::get_pool_info(&pool);
            assert!(minted == test_helpers::sui(100), 2);
            assert!(supply == test_helpers::sui(100), 3);
            assert!(base_bal == 0, 4); // No base asset for puts
            assert!(quote_bal == test_helpers::usdc(200), 5); // 100 * 2 USDC

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_exercise_put_option_in_the_money() {
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
                OPTION_TYPE_PUT,
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

        // Alice mints 100 put options (needs 200 USDC)
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Transfer some options to Bob
        ts::next_tx(&mut scenario, alice());
        {
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let bob_options = coin::split(&mut option_coins, test_helpers::sui(10), ts::ctx(&mut scenario));
            transfer::public_transfer(bob_options, bob());
            transfer::public_transfer(option_coins, alice());
        };

        // Update price to 1.5 USDC (in the money for put)
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

        // Bob exercises 10 put options
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(10));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let sui_payment = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let usdc_payout = options_pool::exercise_put_options(
                &mut pool,
                option_coins,
                sui_payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Bob should receive 20 USDC (10 SUI * 2 USDC strike)
            assert!(coin::value(&usdc_payout) == test_helpers::usdc(20), 0);

            // Supply should decrease
            let supply = options_pool::get_option_supply(&pool);
            assert!(supply == test_helpers::sui(90), 1); // 100 - 10

            transfer::public_transfer(usdc_payout, bob());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 4)] // EOptionNotExercisable
    fun test_exercise_put_option_out_of_money() {
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
                OPTION_TYPE_PUT,
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
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Update price to 2.5 USDC (out of the money for put)
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

        // Bob tries to exercise (should fail - out of money)
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let sui_payment = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let usdc_payout = options_pool::exercise_put_options(
                &mut pool,
                option_coins,
                sui_payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(usdc_payout, bob());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3)] // EInsufficientCollateral
    fun test_mint_put_insufficient_collateral() {
        let mut scenario = ts::begin(admin());
        
        // Setup
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
                OPTION_TYPE_PUT,
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

        // Alice tries to mint 100 puts but only deposits 100 USDC (needs 200)
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100), // Needs 200 USDC, only has 100
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

    #[test]
    fun test_multiple_users_mint_puts() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_usdc_coin(&mut scenario);
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
                OPTION_TYPE_PUT,
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

        // Alice mints 100 puts (200 USDC)
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Bob mints 50 puts (100 USDC)
        test_helpers::mint_usdc(&mut scenario, bob(), test_helpers::usdc(100));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(50),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, bob());
            ts::return_shared(pool);
        };

        // Carol mints 25 puts (50 USDC)
        test_helpers::mint_usdc(&mut scenario, carol(), test_helpers::usdc(50));
        ts::next_tx(&mut scenario, carol());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(25),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, carol());
            transfer::public_transfer(owner_token, carol());
            ts::return_shared(pool);
        };

        // Verify total supply
        ts::next_tx(&mut scenario, admin());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let supply = options_pool::get_option_supply(&pool);
            assert!(supply == test_helpers::sui(175), 0); // 100 + 50 + 25
            
            let (_, _, _, _, _, _, quote_bal, _, _) = options_pool::get_pool_info(&pool);
            assert!(quote_bal == test_helpers::usdc(350), 1); // 200 + 100 + 50
            
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_owner_token_operations() {
        let mut scenario = ts::begin(admin());
        
        // Setup
        test_helpers::init_usdc_coin(&mut scenario);
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
                OPTION_TYPE_PUT,
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
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(200));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            let (option_coins, owner_token) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(100),
                &clock,
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // Test split owner token
        ts::next_tx(&mut scenario, alice());
        {
            let mut owner_token = ts::take_from_sender<OwnerToken<SUI, USDC>>(&scenario);
            
            let split_token = options_pool::split_owner_token(
                &mut owner_token,
                test_helpers::sui(30),
                ts::ctx(&mut scenario)
            );

            assert!(options_pool::get_owner_token_amount(&owner_token) == test_helpers::sui(70), 0);
            assert!(options_pool::get_owner_token_amount(&split_token) == test_helpers::sui(30), 1);

            transfer::public_transfer(split_token, bob());
            ts::return_to_sender(&scenario, owner_token);
        };

        // Test merge owner tokens
        ts::next_tx(&mut scenario, alice());
        {
            let mut owner_token1 = ts::take_from_sender<OwnerToken<SUI, USDC>>(&scenario);
            
            // Mint another batch
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let usdc_coins = coin::mint_for_testing<USDC>(test_helpers::usdc(100), ts::ctx(&mut scenario));
            
            let (option_coins, owner_token2) = options_pool::mint_put_options(
                &mut pool,
                usdc_coins,
                test_helpers::sui(50),
                &clock,
                ts::ctx(&mut scenario)
            );

            // Merge tokens
            options_pool::merge_owner_tokens(&mut owner_token1, owner_token2);
            
            assert!(options_pool::get_owner_token_amount(&owner_token1) == test_helpers::sui(120), 0); // 70 + 50

            transfer::public_transfer(option_coins, alice());
            ts::return_to_sender(&scenario, owner_token1);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
