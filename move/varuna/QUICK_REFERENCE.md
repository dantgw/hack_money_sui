# Quick Reference - Single Token Options Pool

## TL;DR

**OLD (Not Sui Compatible):** One contract creates many token types dynamically  
**NEW (Sui Compatible):** Each option gets its own token module

## Creating a New Option

### 1. Create Token Module

File: `option_tokens/my_option.move`

```move
module varuna::my_option {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::option;
    use sui::object::ID;
    use varuna::options_pool;

    // OTW: Must match module name in UPPERCASE
    public struct MY_OPTION has drop {}

    fun init(witness: MY_OPTION, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness, 9, b"SYMBOL", b"Name", b"Description", option::none(), ctx
        );
        transfer::public_freeze_object(metadata);
        // IMPORTANT: Do NOT mint tokens here! Pool requires zero supply.
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    public fun create_pool<BaseAsset, QuoteAsset>(
        treasury_cap: TreasuryCap<MY_OPTION>,
        deepbook_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        options_pool::create_pool<MY_OPTION, BaseAsset, QuoteAsset>(
            treasury_cap,
            0, // 0=CALL, 1=PUT
            strike_price,
            expiration_date,
            deepbook_pool_id,
            clock,
            ctx,
        )
    }
}
```

### 2. Publish

```bash
sui client publish --gas-budget 100000000
```

### 3. Create Pool

```bash
sui client call \
  --package <PKG> \
  --module my_option \
  --function create_pool \
  --args <TREASURY_CAP> <DEEPBOOK_POOL> <CLOCK> \
  --type-args <BASE> <QUOTE> \
  --gas-budget 100000000
```

## Type Parameters

All functions now need **3 type parameters** instead of 2:

```move
// OLD ❌
mint_call_options<SUI, USDC>(...)

// NEW ✅
mint_call_options<MY_OPTION, SUI, USDC>(...)
```

Order: `<OptionToken, BaseAsset, QuoteAsset>`

## Common Operations

### Mint Call Options (Sell)
```move
let (option_coins, owner_token) = options_pool::mint_call_options<MY_OPTION, SUI, USDC>(
    pool, sui_collateral, clock, ctx
);
```

### Mint Put Options (Sell)
```move
let (option_coins, owner_token) = options_pool::mint_put_options<MY_OPTION, SUI, USDC>(
    pool, usdc_collateral, amount, clock, ctx
);
```

### Exercise Call Options (Buy)
```move
let base = options_pool::exercise_call_options<MY_OPTION, SUI, USDC>(
    pool, option_coins, usdc_payment, clock, ctx
);
```

### Exercise Put Options (Buy)
```move
let quote = options_pool::exercise_put_options<MY_OPTION, SUI, USDC>(
    pool, option_coins, base_asset, clock, ctx
);
```

### Settlement
```move
options_pool::settle_pool<MY_OPTION, SUI, USDC>(
    pool, deepbook_pool, clock, ctx
);
```

### Claim Collateral (Seller)
```move
let (base, quote) = options_pool::claim_collateral_call<MY_OPTION, SUI, USDC>(
    pool, owner_token, ctx
);
```

### Claim After Settlement (Buyer)
```move
let base = options_pool::claim_with_call_options<MY_OPTION, SUI, USDC>(
    pool, option_coins, payment, ctx
);
```

## Struct Changes

```move
// OLD ❌
OptionsPool<BaseAsset, QuoteAsset>
OwnerToken<BaseAsset, QuoteAsset>

// NEW ✅
OptionsPool<OptionToken, BaseAsset, QuoteAsset>
OwnerToken<OptionToken, BaseAsset, QuoteAsset>
```

## Key Differences

| Aspect | Old (Factory) | New (Single Token) |
|--------|---------------|-------------------|
| Token Creation | Dynamic at runtime | Static at compile time (OTW) |
| Type Parameters | 2 (`<Base, Quote>`) | 3 (`<Option, Base, Quote>`) |
| Token Type | Generic `OPTION_TOKEN` | Specific (e.g., `MY_OPTION`) |
| Registry | Required | Not needed |
| Modules per Option | 0 (uses factory) | 1 (dedicated module) |
| Sui Compatible | ❌ No | ✅ Yes |

## Examples in Code

See:
- `option_tokens/call_sui_usdc_2000.move` - CALL option example
- `option_tokens/put_sui_usdc_1500.move` - PUT option example

## Option Types

- **CALL (0)**: Right to BUY base asset at strike price
  - Collateral: BaseAsset
  - Profitable when: price > strike
  
- **PUT (1)**: Right to SELL base asset at strike price
  - Collateral: QuoteAsset (strike × amount)
  - Profitable when: price < strike

## Price Precision

All prices use **9 decimals** (`PRICE_DECIMALS = 1_000_000_000`):
- Strike 2000 USDC = `2_000_000_000_000`
- Strike 1500 USDC = `1_500_000_000_000`

## Constants

```move
OPTION_TYPE_CALL = 0
OPTION_TYPE_PUT = 1
PRICE_DECIMALS = 1_000_000_000
OPTION_TOKEN_DECIMALS = 9
MAX_PRICE_STALENESS_MS = 300_000  // 5 minutes
```

## Error Codes

```move
EPoolNotExpired = 0
EPoolExpired = 1
EPoolAlreadySettled = 2
EInsufficientCollateral = 3
EOptionNotExercisable = 4
EInvalidOptionType = 5
EZeroAmount = 6
EPriceNotSet = 7
EInvalidStrikePrice = 8
EInvalidExpiration = 9
EInvalidPoolReference = 10
EPriceStale = 11
ENotAuthorized = 12
ETokenSupplyNotZero = 13  // Pre-minted tokens detected
```

## Testing

For tests, use the OTW pattern:

```move
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(MY_OPTION {}, ctx);
}
```

## Trading Options

Option tokens are standard `Coin<T>` - they can be:
- ✅ Transferred
- ✅ Split/merged
- ✅ Traded on DeepBook
- ✅ Used in any DeFi protocol

## Need More Help?

- **Usage Guide**: `USAGE.md`
- **Detailed Changes**: `REFACTORING_SUMMARY.md`
- **Examples**: `option_tokens/` directory
