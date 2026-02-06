# Options Pool Refactoring Summary

## Overview

The Varuna options pool contract has been refactored from a dynamic token factory pattern to a single-token pattern to align with Sui's type system constraints.

## Problem with Previous Approach

Sui does not allow dynamic type token creation at runtime. The previous implementation attempted to:
- Use a token factory (`option_token_factory.move`) to create multiple different option tokens dynamically
- Store token metadata (`OptionTokenInfo`) in the pool
- Create generic `OPTION_TOKEN` types that could be minted on demand

This approach violates Sui's fundamental principle that **each coin type must be a distinct, statically defined struct with a One-Time Witness (OTW)**.

## New Approach

### Key Changes

1. **Removed Token Factory Dependency**
   - Deleted import of `option_token_factory` module
   - Removed `OptionTokenRegistry` parameter from `create_pool`
   - Removed `OptionTokenInfo` field from `OptionsPool` struct

2. **Added OptionToken Type Parameter**
   - All structs and functions now have an additional phantom type parameter: `OptionToken`
   - `OptionsPool<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset>`
   - `OwnerToken<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset>`

3. **Modified Pool Creation**
   - Pool now accepts a pre-created `TreasuryCap<OptionToken>` instead of creating tokens
   - Each option type requires its own token module using the OTW pattern
   - Removed symbol/name generation logic (handled in token module)

4. **Updated All Function Signatures**
   - Added `OptionToken` type parameter to all public functions
   - Changed return types from `Coin<OPTION_TOKEN>` to `Coin<OptionToken>`
   - Updated struct references throughout

### Struct Changes

#### Before:
```move
public struct OptionsPool<phantom BaseAsset, phantom QuoteAsset> has key {
    id: UID,
    treasury_cap: TreasuryCap<OPTION_TOKEN>,
    token_info: OptionTokenInfo,
    // ...
}

public struct OwnerToken<phantom BaseAsset, phantom QuoteAsset> has key, store {
    // ...
}
```

#### After:
```move
public struct OptionsPool<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset> has key {
    id: UID,
    treasury_cap: TreasuryCap<OptionToken>,
    // token_info field removed
    // ...
}

public struct OwnerToken<phantom OptionToken, phantom BaseAsset, phantom QuoteAsset> has key, store {
    // ...
}
```

### Function Signature Changes

#### Before:
```move
public fun mint_call_options<BaseAsset, QuoteAsset>(
    pool: &mut OptionsPool<BaseAsset, QuoteAsset>,
    // ...
): (Coin<OPTION_TOKEN>, OwnerToken<BaseAsset, QuoteAsset>)
```

#### After:
```move
public fun mint_call_options<OptionToken, BaseAsset, QuoteAsset>(
    pool: &mut OptionsPool<OptionToken, BaseAsset, QuoteAsset>,
    // ...
): (Coin<OptionToken>, OwnerToken<OptionToken, BaseAsset, QuoteAsset>)
```

### Pool Creation Changes

#### Before:
```move
public fun create_pool<BaseAsset, QuoteAsset>(
    registry: &mut OptionTokenRegistry,
    option_type: u8,
    strike_price: u64,
    expiration_date: u64,
    deepbook_pool_id: ID,
    base_symbol: String,
    quote_symbol: String,
    clock: &Clock,
    ctx: &mut TxContext,
): ID
```

#### After:
```move
public fun create_pool<OptionToken, BaseAsset, QuoteAsset>(
    treasury_cap: TreasuryCap<OptionToken>,
    option_type: u8,
    strike_price: u64,
    expiration_date: u64,
    deepbook_pool_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // ... validation ...
    
    // NEW: Security check - prevents unbacked option tokens
    assert!(coin::total_supply(&treasury_cap) == 0, ETokenSupplyNotZero);
    
    // ...
}
```

**Key Addition:** The pool now checks that the TreasuryCap has zero supply, ensuring no tokens were pre-minted before collateral is deposited. This is a critical security feature.

## How to Create Option Tokens Now

### Step 1: Create Token Module

Each option needs its own module with a unique OTW struct:

```move
module varuna::call_sui_usdc_2000 {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::option;

    /// One-Time Witness (must match module name in UPPERCASE)
    public struct CALL_SUI_USDC_2000 has drop {}

    fun init(witness: CALL_SUI_USDC_2000, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,
            b"CALL-SUI-USDC-2000",
            b"CALL Option SUI/USDC Strike 2000",
            b"Decentralized CALL option",
            option::none(),
            ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}
```

### Step 2: Create Pool with Treasury Cap

After publishing the module, call `create_pool` with the TreasuryCap:

```move
options_pool::create_pool<CALL_SUI_USDC_2000, SUI, USDC>(
    treasury_cap,
    0, // OPTION_TYPE_CALL
    2_000_000_000_000, // strike price
    1735689600000, // expiration
    deepbook_pool_id,
    clock,
    ctx,
)
```

## Files Modified

### Core Contract
- `sources/options_pool.move` - Complete refactor

### Examples
- `option_tokens/call_sui_usdc_2000.move` - New example (replaces `call_sui_usdc_2000_example.move`)

### Documentation
- `USAGE.md` - New comprehensive usage guide
- `REFACTORING_SUMMARY.md` - This file

## Files to Remove (No Longer Needed)

- `sources/option_token_factory.move` - Factory pattern no longer compatible
- `tests/option_token_factory_tests.move` - Tests for removed factory

## Files to Update (Breaking Changes)

All tests and integration code need to be updated with new type parameters:

- `tests/call_options_tests.move`
- `tests/put_options_tests.move`
- `tests/integration_tests.move`
- `tests/test_helpers.move`

## Migration Guide for Existing Code

### Update Type Parameters
Add `OptionToken` as the first type parameter:

```diff
- options_pool::mint_call_options<SUI, USDC>(...)
+ options_pool::mint_call_options<CALL_SUI_USDC_2000, SUI, USDC>(...)
```

### Update Pool Creation
Replace registry-based creation with treasury cap:

```diff
- let pool_id = options_pool::create_pool<SUI, USDC>(
-     registry,
-     OPTION_TYPE_CALL,
-     strike,
-     expiry,
-     deepbook_pool,
-     string::utf8(b"SUI"),
-     string::utf8(b"USDC"),
-     clock,
-     ctx
- );

+ let pool_id = options_pool::create_pool<MY_OPTION_TOKEN, SUI, USDC>(
+     treasury_cap,
+     OPTION_TYPE_CALL,
+     strike,
+     expiry,
+     deepbook_pool,
+     clock,
+     ctx
+ );
```

### Update Return Types
Change generic `OPTION_TOKEN` to specific type:

```diff
- let option_coins: Coin<OPTION_TOKEN> = ...
+ let option_coins: Coin<CALL_SUI_USDC_2000> = ...
```

## Benefits of New Approach

1. **Type Safety**: Each option has a unique, compile-time type
2. **Sui Compatible**: Uses native OTW pattern
3. **Composable**: Option tokens work with all Sui/Move primitives
4. **Clear Ownership**: TreasuryCap holder controls minting
5. **No Magic**: No dynamic type creation, everything is explicit
6. **Security**: Zero supply check prevents unbacked option tokens

## Trade-offs

### Pros
- ✅ Fully compatible with Sui's type system
- ✅ Better type safety (can't mix different options)
- ✅ More explicit and easier to reason about
- ✅ Each option token is a first-class citizen

### Cons
- ❌ Requires creating a new module for each option type
- ❌ More boilerplate code (one module per option)
- ❌ Cannot create options on-the-fly

## Recommended Workflow

1. **Deployment**: Create and publish option token modules ahead of time
2. **Pool Creation**: Call `create_pool` with the treasury cap
3. **Trading**: Option tokens behave like any other `Coin<T>`
4. **Composability**: Use option tokens in DeepBook, lending protocols, etc.

## Constants Preserved

All constants remain unchanged:
- `OPTION_TYPE_CALL = 0`
- `OPTION_TYPE_PUT = 1`
- `PRICE_DECIMALS = 1_000_000_000`
- `MAX_PRICE_STALENESS_MS = 300_000`
- `OPTION_TOKEN_DECIMALS = 9`

## Error Codes Unchanged

All error codes (0-12) remain the same.

## Backward Compatibility

⚠️ **This is a breaking change.** All existing contracts and tests that use the old pattern must be updated.

No backward compatibility is possible because:
1. Function signatures have changed (added type parameter)
2. Pool creation flow is fundamentally different
3. Token factory dependency removed

## Next Steps

1. ✅ Update core contract (completed)
2. ✅ Create example token module (completed)
3. ✅ Write usage documentation (completed)
4. ⏳ Update test files
5. ⏳ Remove deprecated files (option_token_factory)
6. ⏳ Test compilation
7. ⏳ Integration testing

## Questions?

See `USAGE.md` for detailed usage examples and API reference.
