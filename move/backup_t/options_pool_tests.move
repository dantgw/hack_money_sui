#[test_only]
module varuna::options_pool_tests {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::object;
    use sui::transfer;
    use sui::tx_context;
    use std::string;
    use std::option;
    
    use varuna::options_pool::{Self, OptionsPool, AdminCap};
    use varuna::option_token_factory::{Self, OptionTokenRegistry};
    use sui::sui::SUI;

    const ADMIN: address = @0x1;
    const USER1: address = @0x2;
    const USER2: address = @0x3;

    // Helper to create a mock DeepBook pool ID
    fun create_mock_deepbook_pool_id(_ctx: &mut tx_context::TxContext): object::ID {
        object::id_from_address(@0x4)
    }

    #[test]
    fun test_init() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_create_call_pool() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let strike_price = 2_000_000_000; // 2.0 with 9 decimals
            let expiration = 1735689600000; // Future timestamp
            let deepbook_pool_id = create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario));
            
            let pool_id = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8, // OPTION_TYPE_CALL
                strike_price,
                expiration,
                deepbook_pool_id,
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            // Verify pool was created
            assert!(pool_id != object::id_from_address(@0x0), 1);
            
            // Clock is automatically cleaned up
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_create_put_pool() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let strike_price = 1_500_000_000; // 1.5 with 9 decimals
            let expiration = 1735689600000;
            let deepbook_pool_id = create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario));
            
            let pool_id = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                1u8, // OPTION_TYPE_PUT
                strike_price,
                expiration,
                deepbook_pool_id,
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            assert!(pool_id != object::id_from_address(@0x0), 1);
            
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = varuna::options_pool::EInvalidOptionType)]
    fun test_create_pool_invalid_option_type() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let deepbook_pool_id = create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario));
            
            // Invalid option type (should be 0 or 1)
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                2u8, // Invalid
                2_000_000_000,
                1735689600000,
                deepbook_pool_id,
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            // Clock is automatically cleaned up
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = varuna::options_pool::EInvalidExpiration)]
    fun test_create_pool_past_expiration() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let deepbook_pool_id = create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario));
            
            // Past expiration (timestamp 0)
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8,
                2_000_000_000,
                0, // Past expiration
                deepbook_pool_id,
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            // Clock is automatically cleaned up
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_mint_call_options() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        // Create pool
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8, // CALL
                2_000_000_000,
                1735689600000,
                create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario)),
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        
        // Mint call options
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut pool = test_scenario::take_shared<OptionsPool<SUI, SUI>>(&scenario);
            let pool_ref = &mut pool;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let collateral_amount = 100_000_000_000; // 100 SUI with 9 decimals
            let collateral = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
            let collateral_value = coin::value(&collateral);
            
            // Assert we have enough collateral for the test
            assert!(collateral_value >= collateral_amount, 0);
            assert!(collateral_value > 0, 1);
            
            let (option_coins, owner_token) = options_pool::mint_call_options(
                pool_ref,
                collateral,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            // Verify option coins were minted
            let option_amount = coin::value(&option_coins);
            assert!(option_amount == collateral_value, 2);
            
            // Verify owner token amount
            let owner_amount = options_pool::get_owner_token_amount(&owner_token);
            assert!(owner_amount == collateral_value, 3);
            
            transfer::public_transfer(option_coins, USER1);
            transfer::public_transfer(owner_token, USER1);
            
            // Clock is automatically cleaned up
            test_scenario::return_shared(pool);
            clock::destroy_for_testing(clock);
        };
        
        test_scenario::end(scenario);
    }

    #[test]
    fun test_update_price_manual() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8,
                2_000_000_000,
                1735689600000,
                create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario)),
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            test_scenario::return_shared(registry);
            transfer::public_transfer(admin_cap, ADMIN);
            clock::destroy_for_testing(clock);
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = test_scenario::take_shared<OptionsPool<SUI, SUI>>(&scenario);
            let pool_ref = &mut pool;
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let new_price = 2_500_000_000; // 2.5
            
            options_pool::update_price_manual(
                &admin_cap,
                pool_ref,
                new_price,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            // Verify price was updated
            let (price_option, _) = options_pool::get_current_price(pool_ref);
            assert!(option::is_some(&price_option), 1);
            let price = *option::borrow(&price_option);
            assert!(price == new_price, 2);
            
            // Clock is automatically cleaned up
            clock::destroy_for_testing(clock);
            transfer::public_transfer(admin_cap, ADMIN);
            test_scenario::return_shared(pool);
        };
        
        test_scenario::end(scenario);
    }

    #[test]
    fun test_get_pool_info() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let strike_price = 2_000_000_000;
            let expiration = 1735689600000;
            
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8,
                strike_price,
                expiration,
                create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario)),
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            let pool = test_scenario::take_shared<OptionsPool<SUI, SUI>>(&scenario);
            let pool_ref = &pool;
            
            let (option_type, strike, exp, minted, supply, base_bal, quote_bal, settled, settlement_price) = 
                options_pool::get_pool_info(pool_ref);
            
            assert!(option_type == 0u8, 1);
            assert!(strike == strike_price, 2);
            assert!(exp == expiration, 3);
            assert!(minted == 0, 4);
            assert!(supply == 0, 5);
            assert!(base_bal == 0, 6);
            assert!(quote_bal == 0, 7);
            assert!(!settled, 8);
            assert!(option::is_none(&settlement_price), 9);
            
            // Clock is automatically cleaned up
            test_scenario::return_shared(pool);
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        
        test_scenario::end(scenario);
    }

    #[test]
    fun test_merge_owner_tokens() {
        let mut scenario = test_scenario::begin(ADMIN);
        {
            option_token_factory::init_for_testing(test_scenario::ctx(&mut scenario));
            options_pool::init_for_testing(test_scenario::ctx(&mut scenario));
        };
        
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OptionTokenRegistry>(&scenario);
            let registry_ref = &mut registry;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            let _ = options_pool::create_pool<SUI, SUI>(
                registry_ref,
                0u8,
                2_000_000_000,
                1735689600000,
                create_mock_deepbook_pool_id(test_scenario::ctx(&mut scenario)),
                string::utf8(b"SUI"),
                string::utf8(b"SUI"),
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            test_scenario::return_shared(registry);
            clock::destroy_for_testing(clock);
        };
        
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut pool = test_scenario::take_shared<OptionsPool<SUI, SUI>>(&scenario);
            let pool_ref = &mut pool;
            let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            
            // Get coins from sender
            let collateral = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
            let collateral_value = coin::value(&collateral);
            
            // Assert we have collateral for the test
            assert!(collateral_value > 0, 0);
            
            // For testing merge, we'll mint with the full amount and then split the owner token
            let (option_coins1, mut owner_token1) = options_pool::mint_call_options(
                pool_ref,
                collateral,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            
            let total_amount = options_pool::get_owner_token_amount(&owner_token1);
            // Assert we have enough to split (need at least 2)
            assert!(total_amount > 1, 1);
            
            // Split owner token to test merge
            let split_amount = total_amount / 2;
            let owner_token2 = options_pool::split_owner_token(
                &mut owner_token1,
                split_amount,
                test_scenario::ctx(&mut scenario),
            );
            
            // Now merge them back
            options_pool::merge_owner_tokens(&mut owner_token1, owner_token2);
            
            // Verify merged amount
            let merged_amount = options_pool::get_owner_token_amount(&owner_token1);
            assert!(merged_amount == total_amount, 2);
            
            transfer::public_transfer(option_coins1, USER1);
            transfer::public_transfer(owner_token1, USER1);
            
            test_scenario::return_shared(pool);
            clock::destroy_for_testing(clock);
        };
        
        test_scenario::end(scenario);
    }

}
