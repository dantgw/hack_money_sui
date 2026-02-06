// File: tests/option_token_factory_tests.move

#[test_only]
module varuna::option_token_factory_tests {
    use sui::test_scenario::{Self as ts};
    use sui::object;
    use std::string;
    use varuna::option_token_factory::{Self, OptionTokenRegistry, OptionTokenInfo, OPTION_TOKEN};
    use varuna::test_helpers::{Self, admin};

    #[test]
    fun test_create_option_token_factory() {
        let mut scenario = ts::begin(admin());
        
        // Initialize factory
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
        };

        // Check registry was created
        ts::next_tx(&mut scenario, admin());
        {
            let registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            let stats = option_token_factory::get_registry_stats(&registry);
            assert!(stats == 0, 0);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_create_option_currency() {
        let mut scenario = ts::begin(admin());
        
        // Initialize factory
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
        };

        // Create option currency
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            let (treasury_cap, token_info) = option_token_factory::create_option_currency(
                &mut registry,
                b"CALL-SUI-USDC-2000",
                b"CALL Option SUI/USDC",
                b"Call option with strike 2000",
                9,
                ts::ctx(&mut scenario)
            );

            // Check registry stats
            let stats = option_token_factory::get_registry_stats(&registry);
            assert!(stats == 1, 0);

            // Check token info
            let (symbol, name, description, decimals, pool_id) = 
                option_token_factory::get_token_info(&token_info);
            
            assert!(symbol == string::utf8(b"CALL-SUI-USDC-2000"), 1);
            assert!(name == string::utf8(b"CALL Option SUI/USDC"), 2);
            assert!(decimals == 9, 3);
            assert!(option::is_none(&pool_id), 4);

            transfer::public_transfer(treasury_cap, admin());
            transfer::public_transfer(token_info, admin());
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_create_multiple_option_currencies() {
        let mut scenario = ts::begin(admin());
        
        // Initialize factory
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
        };

        // Create first option currency
        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            let (treasury_cap1, token_info1) = option_token_factory::create_option_currency(
                &mut registry,
                b"CALL-SUI-USDC-2000",
                b"CALL Option SUI/USDC Strike 2000",
                b"Call option",
                9,
                ts::ctx(&mut scenario)
            );

            let (treasury_cap2, token_info2) = option_token_factory::create_option_currency(
                &mut registry,
                b"PUT-SUI-USDC-1500",
                b"PUT Option SUI/USDC Strike 1500",
                b"Put option",
                9,
                ts::ctx(&mut scenario)
            );

            // Check registry stats
            let stats = option_token_factory::get_registry_stats(&registry);
            assert!(stats == 2, 0);

            transfer::public_transfer(treasury_cap1, admin());
            transfer::public_transfer(token_info1, admin());
            transfer::public_transfer(treasury_cap2, admin());
            transfer::public_transfer(token_info2, admin());
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_set_pool_id() {
        let mut scenario = ts::begin(admin());
        
        // Initialize factory and create token
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            let (treasury_cap, mut token_info) = option_token_factory::create_option_currency(
                &mut registry,
                b"CALL-SUI-USDC-2000",
                b"CALL Option SUI/USDC",
                b"Call option",
                9,
                ts::ctx(&mut scenario)
            );

            // Set pool ID
            let pool_id = object::id_from_address(@0x123);
            option_token_factory::set_pool_id(&mut token_info, pool_id, 1000000);

            // Verify pool ID was set
            let (_, _, _, _, pool_id_opt) = option_token_factory::get_token_info(&token_info);
            assert!(option::is_some(&pool_id_opt), 0);
            assert!(*option::borrow(&pool_id_opt) == pool_id, 1);

            transfer::public_transfer(treasury_cap, admin());
            transfer::public_transfer(token_info, admin());
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_generate_symbol() {
        let symbol = option_token_factory::generate_symbol(
            b"CALL",
            b"SUI",
            b"USDC",
            2000,
            1735689600000
        );
        
        // Symbol should contain the key components
        // Format: CALL-SUI-USDC-2000-EXP...
        let expected_prefix = b"CALL-SUI-USDC-2000";
        
        // Check that symbol starts with expected prefix
        let mut i = 0;
        while (i < vector::length(&expected_prefix)) {
            assert!(*vector::borrow(&symbol, i) == *vector::borrow(&expected_prefix, i), i);
            i = i + 1;
        };
    }

    #[test]
    fun test_generate_name() {
        let name = option_token_factory::generate_name(
            b"CALL",
            b"SUI",
            b"USDC"
        );
        
        let expected = b"CALL Option SUI/USDC";
        assert!(name == expected, 0);
    }

    #[test]
    fun test_generate_description() {
        let description = option_token_factory::generate_description(
            b"PUT",
            1500,
            1735689600000
        );
        
        // Should contain "Decentralized PUT option with strike"
        let expected_start = b"Decentralized PUT option with strike";
        
        let mut i = 0;
        while (i < vector::length(&expected_start)) {
            assert!(*vector::borrow(&description, i) == *vector::borrow(&expected_start, i), i);
            i = i + 1;
        };
    }

    #[test]
    #[expected_failure(abort_code = 0)] // EInvalidDecimals
    fun test_create_option_currency_invalid_decimals() {
        let mut scenario = ts::begin(admin());
        
        {
            option_token_factory::init_for_testing(ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, admin());
        {
            let mut registry = ts::take_shared<OptionTokenRegistry>(&scenario);
            
            // Try to create with 19 decimals (should fail)
            let (treasury_cap, token_info) = option_token_factory::create_option_currency(
                &mut registry,
                b"CALL-SUI-USDC-2000",
                b"CALL Option SUI/USDC",
                b"Call option",
                19, // Invalid: > 18
                ts::ctx(&mut scenario)
            );

            transfer::public_transfer(treasury_cap, admin());
            transfer::public_transfer(token_info, admin());
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
}
