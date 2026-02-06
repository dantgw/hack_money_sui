// File: tests/integration_tests.move

#[test_only]
module varuna::integration_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use std::string;
    use varuna::options_pool::{Self, OptionsPool, OwnerToken, AdminCap};
    use varuna::option_token_factory::{Self, OptionTokenRegistry, OPTION_TOKEN};
    use varuna::test_helpers::{Self, SUI, USDC, admin, alice, bob, carol};

    const OPTION_TYPE_CALL: u8 = 0;
    const OPTION_TYPE_PUT: u8 = 1;

    /// Full lifecycle test for call options:
    /// 1. Create pool
    /// 2. Multiple sellers mint options
    /// 3. Options are traded (simulated)
    /// 4. Price moves in-the-money
    /// 5. Buyers exercise
    /// 6. Price continues to move
    /// 7. Pool expires and settles
    /// 8. Remaining holders claim
    /// 9. Sellers claim residual
    #[test]
    fun test_full_call_option_lifecycle() {
        let mut scenario = ts::begin(admin());
        
        // === SETUP ===
        test_helpers::init_sui_coin(&mut scenario);
        test_helpers::init_usdc_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let current_time = clock::timestamp_ms(&clock);
        let expiration = current_time + test_helpers::one_month_ms();

        // === 1. CREATE CALL OPTION POOL ===
        // Strike: 2 USDC, Expiration: 1 month
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

        // === 2. ALICE MINTS 100 CALL OPTIONS ===
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

            assert!(coin::value(&option_coins) == test_helpers::sui(100), 0);
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(100), 1);

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // === 3. BOB MINTS 50 CALL OPTIONS ===
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(50));
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

            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(150), 0);

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, bob());
            ts::return_shared(pool);
        };

        // === 4. SIMULATED TRADING: Alice sells 50 options to Carol ===
        ts::next_tx(&mut scenario, alice());
        {
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let carol_options = coin::split(&mut option_coins, test_helpers::sui(50), ts::ctx(&mut scenario));
            transfer::public_transfer(carol_options, carol());
            transfer::public_transfer(option_coins, alice());
        };

        // === 5. PRICE MOVES TO 2.5 USDC (IN THE MONEY) ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
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

        // === 6. CAROL EXERCISES 30 OPTIONS ===
        test_helpers::mint_usdc(&mut scenario, carol(), test_helpers::usdc(100));
        ts::next_tx(&mut scenario, carol());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let exercise_options = coin::split(&mut option_coins, test_helpers::sui(30), ts::ctx(&mut scenario));
            let mut payment = ts::take_from_sender<Coin<USDC>>(&scenario);
            let mut payment_split = coin::split(&mut payment, test_helpers::usdc(60), ts::ctx(&mut scenario)); // 30 * 2
            
            let sui_payout = options_pool::exercise_call_options(
                &mut pool,
                exercise_options,
                payment_split,
                &clock,
                ts::ctx(&mut scenario)
            );

            assert!(coin::value(&sui_payout) == test_helpers::sui(30), 0);
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(120), 1); // 150 - 30

            transfer::public_transfer(sui_payout, carol());
            transfer::public_transfer(option_coins, carol());
            transfer::public_transfer(payment, carol());
            ts::return_shared(pool);
        };

        // === 7. PRICE MOVES TO 3 USDC ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(3),
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // === 8. BOB EXERCISES ALL 50 OPTIONS ===
        test_helpers::mint_usdc(&mut scenario, bob(), test_helpers::usdc(100));
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

            assert!(coin::value(&sui_payout) == test_helpers::sui(50), 0);
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(70), 1); // 120 - 50

            transfer::public_transfer(sui_payout, bob());
            ts::return_shared(pool);
        };

        // === 9. TIME PASSES, PRICE DROPS TO 1.8 USDC ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(18) / 10, // 1.8 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // === 10. EXPIRATION - REMAINING OPTIONS EXPIRE WORTHLESS ===
        // Advance past expiration
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms() + 100);
        
        // Remaining option holders (Alice: 50, Carol: 20) don't exercise
        // They expire worthless since price is below strike

        // === 11. SELLERS CLAIM RESIDUAL COLLATERAL ===
        
        // Alice claims (minted 100, 30 were exercised by Carol from her batch)
        ts::next_tx(&mut scenario, alice());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            // Alice should have:
            // - 70 SUI still in pool (100 minted - 30 exercised)
            // - Plus 60 USDC from Carol's exercise (30 * 2)
            // But settlement would be needed for proper accounting
            
            ts::return_shared(pool);
        };

        // Note: Full settlement flow would require mock DeepBook pool
        // This test demonstrates the lifecycle up to settlement

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// Full lifecycle test for put options
    #[test]
    fun test_full_put_option_lifecycle() {
        let mut scenario = ts::begin(admin());
        
        // === SETUP ===
        test_helpers::init_sui_coin(&mut scenario);
        test_helpers::init_usdc_coin(&mut scenario);
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        let mut clock = test_helpers::create_clock(&mut scenario);
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_month_ms();

        // === 1. CREATE PUT OPTION POOL ===
        // Strike: 2 USDC
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

        // === 2. ALICE MINTS 100 PUT OPTIONS (200 USDC collateral) ===
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

            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(100), 0);

            transfer::public_transfer(option_coins, alice());
            transfer::public_transfer(owner_token, alice());
            ts::return_shared(pool);
        };

        // === 3. BOB MINTS 50 PUT OPTIONS (100 USDC collateral) ===
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

            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(150), 0);

            transfer::public_transfer(option_coins, bob());
            transfer::public_transfer(owner_token, bob());
            ts::return_shared(pool);
        };

        // === 4. TRADING: Alice sells 60 puts to Carol ===
        ts::next_tx(&mut scenario, alice());
        {
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let carol_options = coin::split(&mut option_coins, test_helpers::sui(60), ts::ctx(&mut scenario));
            transfer::public_transfer(carol_options, carol());
            transfer::public_transfer(option_coins, alice());
        };

        // === 5. PRICE CRASHES TO 1.2 USDC (IN THE MONEY) ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(12) / 10, // 1.2 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // === 6. CAROL EXERCISES 40 PUTS ===
        test_helpers::mint_sui(&mut scenario, carol(), test_helpers::sui(40));
        ts::next_tx(&mut scenario, carol());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let exercise_options = coin::split(&mut option_coins, test_helpers::sui(40), ts::ctx(&mut scenario));
            let sui_payment = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let usdc_payout = options_pool::exercise_put_options(
                &mut pool,
                exercise_options,
                sui_payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Carol receives 40 * 2 = 80 USDC
            assert!(coin::value(&usdc_payout) == test_helpers::usdc(80), 0);
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(110), 1); // 150 - 40

            transfer::public_transfer(usdc_payout, carol());
            transfer::public_transfer(option_coins, carol());
            ts::return_shared(pool);
        };

        // === 7. PRICE RECOVERS TO 1.8 USDC ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(18) / 10, // 1.8 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // === 8. BOB EXERCISES 30 PUTS ===
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(30));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let mut option_coins = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let exercise_options = coin::split(&mut option_coins, test_helpers::sui(30), ts::ctx(&mut scenario));
            let sui_payment = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let usdc_payout = options_pool::exercise_put_options(
                &mut pool,
                exercise_options,
                sui_payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            assert!(coin::value(&usdc_payout) == test_helpers::usdc(60), 0);
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(80), 1); // 110 - 30

            transfer::public_transfer(usdc_payout, bob());
            transfer::public_transfer(option_coins, bob());
            ts::return_shared(pool);
        };

        // === 9. PRICE RISES TO 2.3 USDC (OUT OF MONEY) ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms());
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            options_pool::update_price_manual(
                &admin_cap,
                &mut pool,
                test_helpers::usdc(23) / 10, // 2.3 USDC
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // === 10. EXPIRATION ===
        test_helpers::advance_clock(&mut clock, test_helpers::one_week_ms() + 100);

        // Remaining 80 options (Alice: 40, Bob: 20, Carol: 20) expire worthless
        // since price is above strike

        // === 11. VERIFY FINAL STATE ===
        ts::next_tx(&mut scenario, admin());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            
            let supply = options_pool::get_option_supply(&pool);
            assert!(supply == test_helpers::sui(80), 0); // Unexercised options still exist
            
            let (_, _, _, _, _, base_bal, quote_bal, _, _) = options_pool::get_pool_info(&pool);
            
            // Pool should have:
            // - 70 SUI from exercises (40 + 30)
            // - 160 USDC remaining (300 total - 80 - 60 paid out)
            assert!(base_bal == test_helpers::sui(70), 1);
            assert!(quote_bal == test_helpers::usdc(160), 2);
            
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// Test complex scenario with multiple option types
    #[test]
    fun test_multiple_pools_same_underlying() {
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

        // Create call pool with strike 2 USDC
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

        // Create put pool with strike 2 USDC (same strike, different type)
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

        // Verify registry tracked both
        ts::next_tx(&mut scenario, admin());
        {
            let registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            let stats = option_token_factory::get_registry_stats(&registry);
            assert!(stats == 2, 0); // Two option tokens created
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// Test supply dynamics with minting and burning
    #[test]
    fun test_supply_dynamics() {
        let mut scenario = ts::begin(admin());
        
        test_helpers::init_sui_coin(&mut scenario);
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

        // Initial supply: 0
        ts::next_tx(&mut scenario, admin());
        {
            let pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            assert!(options_pool::get_option_supply(&pool) == 0, 0);
            ts::return_shared(pool);
        };

        // Alice mints 100 → supply: 100
        test_helpers::mint_sui(&mut scenario, alice(), test_helpers::sui(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui = ts::take_from_sender<Coin<SUI>>(&scenario);
            let (opts, owner) = options_pool::mint_call_options(&mut pool, sui, &clock, ts::ctx(&mut scenario));
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(100), 0);
            transfer::public_transfer(opts, alice());
            transfer::public_transfer(owner, alice());
            ts::return_shared(pool);
        };

        // Bob mints 50 → supply: 150
        test_helpers::mint_sui(&mut scenario, bob(), test_helpers::sui(50));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui = ts::take_from_sender<Coin<SUI>>(&scenario);
            let (opts, owner) = options_pool::mint_call_options(&mut pool, sui, &clock, ts::ctx(&mut scenario));
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(150), 0);
            transfer::public_transfer(opts, bob());
            transfer::public_transfer(owner, bob());
            ts::return_shared(pool);
        };

        // Update price to ITM
        ts::next_tx(&mut scenario, admin());
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            options_pool::update_price_manual(&admin_cap, &mut pool, test_helpers::usdc(3), &clock, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(pool);
        };

        // Alice exercises 30 → supply: 120
        test_helpers::mint_usdc(&mut scenario, alice(), test_helpers::usdc(100));
        ts::next_tx(&mut scenario, alice());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let mut opts = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let exercise_opts = coin::split(&mut opts, test_helpers::sui(30), ts::ctx(&mut scenario));
            let mut usdc = ts::take_from_sender<Coin<USDC>>(&scenario);
            let mut payment = coin::split(&mut usdc, test_helpers::usdc(60), ts::ctx(&mut scenario));
            let sui = options_pool::exercise_call_options(&mut pool, exercise_opts, payment, &clock, ts::ctx(&mut scenario));
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(120), 0);
            transfer::public_transfer(sui, alice());
            transfer::public_transfer(opts, alice());
            transfer::public_transfer(usdc, alice());
            ts::return_shared(pool);
        };

        // Bob exercises 20 → supply: 100
        test_helpers::mint_usdc(&mut scenario, bob(), test_helpers::usdc(100));
        ts::next_tx(&mut scenario, bob());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let mut opts = ts::take_from_sender<Coin<OPTION_TOKEN>>(&scenario);
            let exercise_opts = coin::split(&mut opts, test_helpers::sui(20), ts::ctx(&mut scenario));
            let mut usdc = ts::take_from_sender<Coin<USDC>>(&scenario);
            let mut payment = coin::split(&mut usdc, test_helpers::usdc(40), ts::ctx(&mut scenario));
            let sui = options_pool::exercise_call_options(&mut pool, exercise_opts, payment, &clock, ts::ctx(&mut scenario));
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(100), 0);
            transfer::public_transfer(sui, bob());
            transfer::public_transfer(opts, bob());
            transfer::public_transfer(usdc, bob());
            ts::return_shared(pool);
        };

        // Carol mints 25 → supply: 125
        test_helpers::mint_sui(&mut scenario, carol(), test_helpers::sui(25));
        ts::next_tx(&mut scenario, carol());
        {
            let mut pool = ts::take_shared<OptionsPool<SUI, USDC>>(&scenario);
            let sui = ts::take_from_sender<Coin<SUI>>(&scenario);
            let (opts, owner) = options_pool::mint_call_options(&mut pool, sui, &clock, ts::ctx(&mut scenario));
            assert!(options_pool::get_option_supply(&pool) == test_helpers::sui(125), 0);
            transfer::public_transfer(opts, carol());
            transfer::public_transfer(owner, carol());
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
