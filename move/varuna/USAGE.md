# Varuna Options Pool - Usage Guide

## Overview

The Varuna options pool contract has been refactored to work with Sui's type system by using specific option token types instead of a dynamic factory. Each option (e.g., CALL SUI/USDC Strike 2000 expiring Jan 1, 2025) requires its own token module.

## Key Changes from Factory Pattern

### Before (Factory Pattern - Not Compatible with Sui)
- One contract tried to create multiple different token types dynamically
- Used a token factory to generate tokens on demand
- Not compatible with Sui's type system

### After (Single Token Pattern - Sui Compatible)
- Each option has its own token module with a unique type
- Uses the One-Time Witness (OTW) pattern for token creation
- Fully compatible with Sui's type system
- Each pool is parameterized by three types: `<OptionToken, BaseAsset, QuoteAsset>`

## Creating a New Option Token and Pool

### Step 1: Create the Option Token Module

Create a new module file in `option_tokens/` directory. Example: `call_sui_usdc_2000.move`

```move
module varuna::call_sui_usdc_2000 {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::option;
    use sui::object::ID;
    use varuna::options_pool;

    /// One-Time Witness - must match module name in UPPERCASE
    public struct CALL_SUI_USDC_2000 has drop {}

    // Define your option parameters
    const STRIKE_PRICE: u64 = 2_000_000_000_000; // 2000 USDC (9 decimals precision)
    const EXPIRATION_DATE: u64 = 1735689600000; // Unix timestamp in milliseconds

    /// Initialize the token (runs once when module is published)
    /// IMPORTANT: Do NOT mint any tokens here! The pool requires zero supply.
    fun init(witness: CALL_SUI_USDC_2000, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                          // decimals
            b"CALL-SUI-USDC-2000",                     // symbol
            b"CALL Option SUI/USDC Strike 2000",       // name
            b"Decentralized CALL option with strike 2000", // description
            option::none(),                             // icon URL
            ctx
        );

        transfer::public_freeze_object(metadata);
        // Transfer treasury_cap WITHOUT minting any tokens
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Helper to create the pool
    public fun create_pool<SUI, USDC>(
        treasury_cap: TreasuryCap<CALL_SUI_USDC_2000>,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        options_pool::create_pool<CALL_SUI_USDC_2000, SUI, USDC>(
            treasury_cap,
            0, // OPTION_TYPE_CALL (0) or OPTION_TYPE_PUT (1)
            STRIKE_PRICE,
            EXPIRATION_DATE,
            deepbook_pool_id,
            clock,
            ctx,
        )
    }
}
```

### Step 2: Publish the Module

```bash
sui client publish --gas-budget 100000000
```

When the module is published, the `init` function runs automatically, creating the token and transferring the `TreasuryCap` to the publisher.

### Step 3: Create the Pool

After publishing, call the `create_pool` helper function with:
- The `TreasuryCap` you received (must have zero supply - no pre-minted tokens!)
- The DeepBook pool ID for price oracle
- Clock object
- Transaction context

**CRITICAL:** The pool creation will fail if any tokens were pre-minted. This security feature ensures all option tokens are fully backed by collateral.

```bash
sui client call --package <PACKAGE_ID> \
  --module call_sui_usdc_2000 \
  --function create_pool \
  --args <TREASURY_CAP_ID> <DEEPBOOK_POOL_ID> <CLOCK_ID> \
  --type-args <SUI_TYPE> <USDC_TYPE> \
  --gas-budget 100000000
```

## Using the Options Pool

### Minting Call Options (Sellers)

Deposit BaseAsset (e.g., SUI) to mint call options:

```move
let (option_coins, owner_token) = options_pool::mint_call_options<CALL_SUI_USDC_2000, SUI, USDC>(
    pool,
    collateral_coin, // Coin<SUI>
    clock,
    ctx,
);
```

Returns:
- `option_coins`: Tradeable `Coin<CALL_SUI_USDC_2000>` that can be sold on DeepBook
- `owner_token`: Represents claim to residual collateral after settlement

### Minting Put Options (Sellers)

Deposit QuoteAsset (e.g., USDC) to mint put options:

```move
let (option_coins, owner_token) = options_pool::mint_put_options<PUT_SUI_USDC_1500, SUI, USDC>(
    pool,
    collateral_coin,  // Coin<USDC>
    amount,           // Number of put options in BaseAsset units
    clock,
    ctx,
);
```

### Exercising Call Options (Buyers)

Before expiration, if current price > strike price:

```move
let base_asset = options_pool::exercise_call_options<CALL_SUI_USDC_2000, SUI, USDC>(
    pool,
    option_coins,     // Coin<CALL_SUI_USDC_2000>
    payment,          // Coin<USDC> - payment at strike price
    clock,
    ctx,
);
// Returns Coin<SUI>
```

### Exercising Put Options (Buyers)

Before expiration, if current price < strike price:

```move
let quote_asset = options_pool::exercise_put_options<PUT_SUI_USDC_1500, SUI, USDC>(
    pool,
    option_coins,     // Coin<PUT_SUI_USDC_1500>
    base_asset,       // Coin<SUI> - asset to sell
    clock,
    ctx,
);
// Returns Coin<USDC>
```

### Settlement After Expiration

Anyone can settle the pool after expiration:

```move
options_pool::settle_pool<CALL_SUI_USDC_2000, SUI, USDC>(
    pool,
    deepbook_pool,    // DeepBook price oracle
    clock,
    ctx,
);
```

### Claiming Collateral (Sellers)

After settlement, option sellers can claim their residual collateral with owner tokens:

```move
// For call options
let (base_coin, quote_coin) = options_pool::claim_collateral_call<CALL_SUI_USDC_2000, SUI, USDC>(
    pool,
    owner_token,
    ctx,
);

// For put options
let (base_coin, quote_coin) = options_pool::claim_collateral_put<PUT_SUI_USDC_1500, SUI, USDC>(
    pool,
    owner_token,
    ctx,
);
```

### Claiming with Options (Buyers)

After settlement, option buyers can claim if in the money:

```move
// For call options (if settlement price > strike)
let base_asset = options_pool::claim_with_call_options<CALL_SUI_USDC_2000, SUI, USDC>(
    pool,
    option_coins,
    payment,          // Coin<USDC> at strike price
    ctx,
);

// For put options (if settlement price < strike)
let quote_asset = options_pool::claim_with_put_options<PUT_SUI_USDC_1500, SUI, USDC>(
    pool,
    option_coins,
    base_asset,       // Coin<SUI>
    ctx,
);
```

## Type Parameters Explained

Every function now requires three type parameters:

1. **OptionToken**: The specific option token type (e.g., `CALL_SUI_USDC_2000`)
2. **BaseAsset**: The underlying asset (e.g., `SUI`)
3. **QuoteAsset**: The quote/payment asset (e.g., `USDC`)

Example:
```move
options_pool::mint_call_options<CALL_SUI_USDC_2000, SUI, USDC>(...)
```

## Trading Option Tokens

Once minted, option tokens are standard `Coin<T>` objects that can be:
- Transferred to other addresses
- Split and merged using `coin::split()` and `coin::join()`
- **Traded on DeepBook** - Create a liquidity pool for the option token
- Used in any DeFi protocol that accepts `Coin` types

## Advantages of This Approach

1. ✅ **Type Safety**: Each option has a distinct type, preventing mix-ups
2. ✅ **Sui Compatible**: Uses native Sui patterns (OTW, phantom types)
3. ✅ **Composable**: Option tokens work with all Sui DeFi protocols
4. ✅ **Clear Ownership**: TreasuryCap determines who controls minting
5. ✅ **Flexible**: Can create any number of different option types

## Example: Complete Flow for Call Options

### 1. Option Seller (Writer)
```move
// Deposit 100 SUI to mint 100 CALL options
let (option_coins, owner_token) = mint_call_options(pool, sui_coin_100, clock, ctx);

// Sell option_coins on DeepBook or transfer to buyer
transfer::public_transfer(option_coins, buyer_address);

// Keep owner_token to claim residual collateral after settlement
```

### 2. Option Buyer
```move
// Buy option_coins from seller or DeepBook
// Wait for price to go above strike

// Exercise if in the money
let sui_payout = exercise_call_options(pool, option_coins, usdc_payment, clock, ctx);

// Or wait for settlement and claim
settle_pool(pool, deepbook_pool, clock, ctx);
let sui_payout = claim_with_call_options(pool, option_coins, usdc_payment, ctx);
```

### 3. After Expiration
```move
// Seller claims residual collateral with owner_token
let (sui, usdc) = claim_collateral_call(pool, owner_token, ctx);
```

## Constants Reference

- **OPTION_TYPE_CALL**: `0`
- **OPTION_TYPE_PUT**: `1`
- **PRICE_DECIMALS**: `1_000_000_000` (9 decimals)
- **OPTION_TOKEN_DECIMALS**: `9`
- **MAX_PRICE_STALENESS_MS**: `300_000` (5 minutes)

## Error Codes

- `EPoolNotExpired (0)`: Pool hasn't expired yet
- `EPoolExpired (1)`: Pool has expired
- `EPoolAlreadySettled (2)`: Pool already settled
- `EInsufficientCollateral (3)`: Not enough collateral provided
- `EOptionNotExercisable (4)`: Option is out of the money
- `EInvalidOptionType (5)`: Wrong option type for this operation
- `EZeroAmount (6)`: Amount must be greater than zero
- `EPriceNotSet (7)`: Price oracle not updated
- `EInvalidStrikePrice (8)`: Strike price must be positive
- `EInvalidExpiration (9)`: Expiration must be in the future
- `EInvalidPoolReference (10)`: Owner token doesn't match pool
- `EPriceStale (11)`: Price data is too old
- `ENotAuthorized (12)`: Operation not authorized
- `ETokenSupplyNotZero (13)`: TreasuryCap has pre-minted tokens (supply must be zero)

## Next Steps

1. Create your option token modules for specific strikes/expiries
2. Publish and get the TreasuryCap
3. Create pools using the treasury cap
4. Start minting and trading options!

For more examples, see the `option_tokens/` directory.
