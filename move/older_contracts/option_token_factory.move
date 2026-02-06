// File: sources/option_token_factory.move

module varuna::option_token_factory {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, TreasuryCap, CoinMetadata};
    use sui::transfer;
    use sui::event;
    use std::string::{Self, String};
    use std::option::{Self, Option};
    
    // ====== Error Codes ======
    const EInvalidDecimals: u64 = 0;

    // ====== Structs ======

    /// Witness type for creating option tokens
    /// Each option pool will have its own instance
    public struct OPTION_TOKEN has drop {}

    /// Registry to track all created option tokens
    public struct OptionTokenRegistry has key {
        id: UID,
        /// Counter for tracking number of tokens created
        total_tokens_created: u64,
    }

    /// Metadata about an option token
    public struct OptionTokenInfo has key, store {
        id: UID,
        /// Symbol of the option token (e.g., "CALL-SUI-USDC-2000-20250101")
        symbol: String,
        /// Full name (e.g., "CALL Option SUI/USDC Strike 2000")
        name: String,
        /// Description
        description: String,
        /// Decimals
        decimals: u8,
        /// Associated pool ID
        pool_id: Option<ID>,
        /// Timestamp when created
        created_at: u64,
    }

    // ====== Events ======

    public struct OptionTokenCreated has copy, drop {
        symbol: String,
        name: String,
        decimals: u8,
        creator: address,
    }

    // ====== Initialization ======

    fun init(ctx: &mut TxContext) {
        let registry = OptionTokenRegistry {
            id: object::new(ctx),
            total_tokens_created: 0,
        };
        transfer::share_object(registry);
    }

    // ====== Public Functions ======

    /// Create a new option token currency
    /// Returns the TreasuryCap and metadata info
    /// The TreasuryCap is used by the pool to mint/burn tokens
    public fun create_option_currency(
        registry: &mut OptionTokenRegistry,
        symbol: vector<u8>,
        name: vector<u8>,
        description: vector<u8>,
        decimals: u8,
        ctx: &mut TxContext,
    ): (TreasuryCap<OPTION_TOKEN>, OptionTokenInfo) {
        // Validate decimals (typically 9 for Sui tokens)
        assert!(decimals <= 18, EInvalidDecimals);

        // Create the coin with metadata
        let (treasury_cap, coin_metadata) = coin::create_currency(
            OPTION_TOKEN {},
            decimals,
            symbol,
            name,
            description,
            option::none(), // No icon URL
            ctx
        );

        // Update registry
        registry.total_tokens_created = registry.total_tokens_created + 1;

        // Create info object
        let info = OptionTokenInfo {
            id: object::new(ctx),
            symbol: string::utf8(symbol),
            name: string::utf8(name),
            description: string::utf8(description),
            decimals,
            pool_id: option::none(),
            created_at: 0, // Will be set by pool when associated
        };

        // Freeze the coin metadata so it can't be changed
        transfer::public_freeze_object(coin_metadata);

        event::emit(OptionTokenCreated {
            symbol: string::utf8(symbol),
            name: string::utf8(name),
            decimals,
            creator: tx_context::sender(ctx),
        });

        (treasury_cap, info)
    }

    /// Update the pool ID association for an option token
    public fun set_pool_id(
        info: &mut OptionTokenInfo,
        pool_id: ID,
        timestamp: u64,
    ) {
        info.pool_id = option::some(pool_id);
        info.created_at = timestamp;
    }

    // ====== View Functions ======

    public fun get_registry_stats(registry: &OptionTokenRegistry): u64 {
        registry.total_tokens_created
    }

    public fun get_token_info(info: &OptionTokenInfo): (String, String, String, u8, Option<ID>) {
        (
            info.symbol,
            info.name,
            info.description,
            info.decimals,
            info.pool_id,
        )
    }

    // ====== Helper Functions ======

    /// Generate symbol for option token
    /// Format: CALL-SUI-USDC-2000-EXP1234567890
    public fun generate_symbol(
        option_type_str: vector<u8>,
        base_symbol: vector<u8>,
        quote_symbol: vector<u8>,
        strike_display: u64,
        expiration_date: u64,
    ): vector<u8> {
        let mut symbol = option_type_str;
        vector::append(&mut symbol, b"-");
        vector::append(&mut symbol, base_symbol);
        vector::append(&mut symbol, b"-");
        vector::append(&mut symbol, quote_symbol);
        vector::append(&mut symbol, b"-");
        
        // Convert strike to string (simplified - in production use proper u64 to string conversion)
        vector::append(&mut symbol, u64_to_ascii(strike_display));
        vector::append(&mut symbol, b"-EXP");
        vector::append(&mut symbol, u64_to_ascii(expiration_date / 1000000)); // Simplified timestamp
        
        symbol
    }

    /// Generate name for option token
    public fun generate_name(
        option_type_str: vector<u8>,
        base_symbol: vector<u8>,
        quote_symbol: vector<u8>,
    ): vector<u8> {
        let mut name = option_type_str;
        vector::append(&mut name, b" Option ");
        vector::append(&mut name, base_symbol);
        vector::append(&mut name, b"/");
        vector::append(&mut name, quote_symbol);
        name
    }

    /// Generate description for option token
    public fun generate_description(
        option_type_str: vector<u8>,
        strike_display: u64,
        expiration_date: u64,
    ): vector<u8> {
        let mut desc = b"Decentralized ";
        vector::append(&mut desc, option_type_str);
        vector::append(&mut desc, b" option with strike ");
        vector::append(&mut desc, u64_to_ascii(strike_display));
        desc
    }

    // Simple u64 to ASCII conversion (for demonstration - use a proper library in production)
    fun u64_to_ascii(mut num: u64): vector<u8> {
        if (num == 0) {
            return b"0"
        };

        let mut result = vector::empty<u8>();
        while (num > 0) {
            let digit = ((num % 10) as u8) + 48; // 48 is ASCII '0'
            vector::push_back(&mut result, digit);
            num = num / 10;
        };
        
        // Reverse the vector
        vector::reverse(&mut result);
        result
    }

    // ====== Test-only Functions ======
    
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
