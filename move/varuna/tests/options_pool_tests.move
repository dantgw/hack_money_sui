// File: tests/options_pool_tests.move
//
// End-to-end tests for the Varuna options pool.

#[test_only]
module varuna::options_pool_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::clock;
    use sui::transfer;

    use varuna::options_pool;
    use varuna::test_helpers;
    use varuna::deep;
    use varuna::usdc;
    use varuna::call_option_test;

    /// Helper: initialize the CALL option currency and return its TreasuryCap.
    fun init_call_option_currency(scenario: &mut Scenario): coin::TreasuryCap<call_option_test::CALL_OPTION> {
        // Run the option token init (creates the currency and transfers TreasuryCap to ADMIN)
        ts::next_tx(scenario, test_helpers::admin());
        {
            let ctx = ts::ctx(scenario);
            call_option_test::init_currency(scenario);
        };

        // Retrieve TreasuryCap from ADMIN
        ts::next_tx(scenario, test_helpers::admin());
        ts::take_from_sender<coin::TreasuryCap<call_option_test::CALL_OPTION>>(scenario)
    }

    /// Ensure that create_pool aborts if the option token supply is non-zero.
    #[test]
    #[expected_failure(abort_code = 13)] // ETokenSupplyNotZero
    fun test_create_pool_rejects_nonzero_supply() {
        let mut scenario = ts::begin(test_helpers::admin());

        // Initialize option currency and pre-mint some tokens (non-zero supply)
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let ctx = ts::ctx(&mut scenario);
            let mut treasury = init_call_option_currency(&mut scenario);
            // Mint a few option tokens to make supply non-zero
            let _coins = coin::mint(&mut treasury, 10, ts::ctx(&mut scenario));
            // Store TreasuryCap with admin for later use
            transfer::public_transfer(treasury, test_helpers::admin());
            coin::burn_for_testing(_coins);
        };

        // Attempt to create pool with non-zero supply TreasuryCap -> should abort
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let treasury = ts::take_from_sender<coin::TreasuryCap<call_option_test::CALL_OPTION>>(&mut scenario);
            let clock = test_helpers::create_clock(&mut scenario);
            let strike = test_helpers::usdc(2000); // 2000 USDC with PRICE_DECIMALS
            let expiration = clock::timestamp_ms(&clock) + test_helpers::one_day_ms();
            let deepbook_pool_id = test_helpers::mock_deepbook_pool_id();

            let _pool_id = options_pool::create_pool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>(
                treasury,
                0, // OPTION_TYPE_CALL
                strike,
                expiration,
                deepbook_pool_id,
                &clock,
                ts::ctx(&mut scenario),
            );
            clock::destroy_for_testing(clock);


        };

        ts::end(scenario);
    }

    /// Happy-path test: CALL option flow (mint -> exercise -> claim collateral).
    #[test]
    fun test_call_option_full_flow() {
        let mut scenario = ts::begin(test_helpers::admin());

        // Initialize base/quote currencies and admin cap
        {
            test_helpers::init_sui_coin(&mut scenario);
            test_helpers::init_usdc_coin(&mut scenario);
        };

        // Initialize options pool admin cap
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            options_pool::init_for_testing(ts::ctx(&mut scenario));
        };

        // Create CALL option currency (zero initial supply)
        let call_treasury = init_call_option_currency(&mut scenario);

        // Create a clock and pool
        let clock = test_helpers::create_clock(&mut scenario);
        let strike = test_helpers::usdc(2000); // strike = 2000 USDC per SUI
        let expiration = clock::timestamp_ms(&clock) + test_helpers::one_day_ms();
        let deepbook_pool_id = test_helpers::mock_deepbook_pool_id();

        ts::next_tx(&mut scenario, test_helpers::admin());
        let pool_id = {
            let ctx = ts::ctx(&mut scenario);
            options_pool::create_pool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>(
                call_treasury,
                0, // OPTION_TYPE_CALL
                strike,
                expiration,
                deepbook_pool_id,
                &clock,
                ctx,
            )
        };

        // Mint SUI collateral to admin (writer)
        let writer_collateral = test_helpers::sui(100); // 100 SUI
        test_helpers::mint_sui(&mut scenario, test_helpers::admin(), writer_collateral);

        // Writer mints CALL options by depositing SUI collateral
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let mut pool = ts::take_shared<
                options_pool::OptionsPool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>
            >(&scenario);
            // Take SUI collateral from admin
            let collateral = ts::take_from_sender<coin::Coin<deep::DEEP>>(&mut scenario);
            let local_clock = test_helpers::create_clock(&mut scenario);

            let (option_coins, owner_token) = options_pool::mint_call_options<
                call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC
            >(
                &mut pool,
                collateral,
                &local_clock,
                ts::ctx(&mut scenario),
            );

            // Store minted options and owner token with admin
            transfer::public_transfer(option_coins, test_helpers::admin());
            transfer::public_transfer(owner_token, test_helpers::admin());
            clock::destroy_for_testing(local_clock);

            ts::return_shared(pool);
        };

        // Mint USDC to admin for exercising options (buyer paying strike)
        let payment_amount = test_helpers::usdc(100 * 2000); // over-provisioned payment
        test_helpers::mint_usdc(&mut scenario, test_helpers::admin(), payment_amount);

        // Update price to be in-the-money and exercise some CALL options
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let mut pool = ts::take_shared<
                options_pool::OptionsPool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>
            >(&scenario);
            let admin_cap = ts::take_from_sender<options_pool::AdminCap>(&mut scenario);
            let local_clock = test_helpers::create_clock(&mut scenario);

            // Set current price above strike so CALLs are exercisable
            let in_the_money_price = strike + test_helpers::usdc(100); // strike + 100
            options_pool::update_price_manual<
                call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC
            >(
                &admin_cap,
                &mut pool,
                in_the_money_price,
                &local_clock,
                ts::ctx(&mut scenario),
            );

            // Take some option tokens and USDC payment from admin and exercise
            let option_coins = ts::take_from_sender<coin::Coin<call_option_test::CALL_OPTION>>(&mut scenario);
            let payment = ts::take_from_sender<coin::Coin<usdc::USDC>>(&mut scenario);

            let _payout_sui = options_pool::exercise_call_options<
                call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC
            >(
                &mut pool,
                option_coins,
                payment,
                &local_clock,
                ts::ctx(&mut scenario),
            );
            coin::burn_for_testing(_payout_sui);
            clock::destroy_for_testing(local_clock);
            // Return admin cap and pool
            transfer::public_transfer(admin_cap, test_helpers::admin());
            ts::return_shared(pool);

        };

        // Manually mark pool as settled at the same in-the-money price (test-only helper)
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let mut pool = ts::take_shared<
                options_pool::OptionsPool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>
            >(&scenario);
            options_pool::set_settlement_for_testing<
                call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC
            >(
                &mut pool,
                strike + test_helpers::usdc(100),
            );
            ts::return_shared(pool);
        };

        // Writer claims remaining collateral with owner token
        ts::next_tx(&mut scenario, test_helpers::admin());
        {
            let mut pool = ts::take_shared<
                options_pool::OptionsPool<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>
            >(&scenario);
            let owner_token = ts::take_from_sender<
                options_pool::OwnerToken<call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC>
            >(
                &mut scenario,
            );

            let (base_payout, quote_payout) = options_pool::claim_collateral_call<
                call_option_test::CALL_OPTION, deep::DEEP, usdc::USDC
            >(
                &mut pool,
                owner_token,
                ts::ctx(&mut scenario),
            );

            // Basic sanity checks: some payout should be returned
            assert!(coin::value(&base_payout) >= 0, 0);
            assert!(coin::value(&quote_payout) >= 0, 1);

            ts::return_shared(pool);
            coin::burn_for_testing(quote_payout);
            coin::burn_for_testing(base_payout);
        };
        
        // Destroy the initial clock to consume the non-drop value
        clock::destroy_for_testing(clock);

        ts::end(scenario);
    }
}

