# Decentralized Options Exchange on Sui

A fully decentralized options exchange built on Sui using DeepBook for price discovery and liquidity.

## Architecture Overview

### Key Components

1. **option_token_factory.move**: Creates unique `Coin<OPTION_TOKEN>` types for each option pool
2. **options_pool.move**: Main contract managing option lifecycle, collateral, and settlement

### Token Supply Mechanics

- **Minting**: When sellers deposit collateral, option tokens are minted (supply INCREASES)
- **Exercising**: When buyers exercise options, option tokens are burned (supply DECREASES)
- **Trading**: Option tokens are standard `Coin<OPTION_TOKEN>` that can be traded on DeepBook

## How It Works

### For Call Options

1. **Seller (Option Writer)**:
   - Deposits BaseAsset (e.g., 100 SUI) as collateral
   - Receives 100 `OPTION_TOKEN` coins + 100 `OwnerToken`s
   - Can sell the OPTION_TOKENs on DeepBook for premium
   - After expiration:
     - If price ≤ strike: Claims back 100 SUI with OwnerTokens
     - If price > strike: Claims QuoteAsset (USDC) paid by exercisers

2. **Buyer (Option Holder)**:
   - Buys `OPTION_TOKEN`s from DeepBook
   - Before expiration (American style):
     - If price > strike: Exercise by paying strike price in USDC, receive SUI
   - After settlement:
     - If price > strike: Claim by paying strike price, receive SUI

### For Put Options

1. **Seller (Option Writer)**:
   - Deposits QuoteAsset (e.g., 2000 USDC for 1 SUI at strike $2000) as collateral
   - Receives 1 `OPTION_TOKEN` coin + 1 `OwnerToken`
   - Can sell the OPTION_TOKEN on DeepBook for premium
   - After expiration:
     - If price ≥ strike: Claims back 2000 USDC with OwnerToken
     - If price < strike: Claims SUI deposited by exercisers

2. **Buyer (Option Holder)**:
   - Buys `OPTION_TOKEN`s from DeepBook
   - Before expiration:
     - If price < strike: Exercise by providing SUI, receive USDC at strike price
   - After settlement:
     - If price < strike: Claim by providing SUI, receive USDC

## Usage Examples

### Example 1: Creating a Call Option Pool

```move
// Create a SUI/USDC call option pool
// Strike: 2 USDC per SUI
// Expiration: Jan 1, 2025

let pool_id = options_pool::create_pool<SUI, USDC>(
    registry,
    OPTION_TYPE_CALL,
    2_000_000_000,           // Strike price (2 USDC with 9 decimals)
    1735689600000,           // Expiration timestamp (ms)
    deepbook_pool_id,        // DeepBook SUI/USDC pool ID
    string::utf8(b"SUI"),
    string::utf8(b"USDC"),
    clock,
    ctx
);
```

### Example 2: Seller Minting Call Options

```move
// Seller deposits 100 SUI to mint 100 call options
let sui_coins = coin::split(&mut sui_balance, 100_000_000_000, ctx);

let (option_coins, owner_token) = options_pool::mint_call_options(
    pool,
    sui_coins,
    clock,
    ctx
);

// Seller can now:
// 1. List option_coins on DeepBook to sell for premium
// 2. Hold owner_token to claim residual collateral after expiration
```

### Example 3: Listing Options on DeepBook

```move
// Create a DeepBook pool for OPTION_TOKEN/USDC
use deepbook::pool;

// This allows the market to trade the option tokens
// Buyers pay USDC premium to buy option tokens
// Sellers receive USDC premium when selling option tokens
```

### Example 4: Buyer Exercising Call Option

```move
// Price went up to 2.5 USDC, buyer wants to exercise
// Need to update price first
options_pool::update_price(pool, deepbook_pool, clock, ctx);

// Exercise 10 call options
let option_coins = // ... get from wallet
let payment = coin::split(&mut usdc_balance, 20_000_000_000, ctx); // 10 * 2 USDC

let sui_payout = options_pool::exercise_call_options(
    pool,
    option_coins,  // Burned (supply decreases)
    payment,       // 20 USDC paid
    clock,
    ctx
);
// Receives 10 SUI worth ~25 USDC at current price
```

### Example 5: Settlement and Claiming

```move
// After expiration, anyone can settle
options_pool::settle_pool(pool, deepbook_pool, clock, ctx);

// Option writer claims residual collateral
let (sui_coin, usdc_coin) = options_pool::claim_collateral_call(
    pool,
    owner_token,
    ctx
);

// If out of money: Gets back SUI
// If in the money: Gets USDC from exercisers
```

### Example 6: Creating and Minting Put Options

```move
// Create put option pool (SUI/USDC, strike $1.50)
let pool_id = options_pool::create_pool<SUI, USDC>(
    registry,
    OPTION_TYPE_PUT,
    1_500_000_000,           // Strike: 1.5 USDC
    1735689600000,
    deepbook_pool_id,
    string::utf8(b"SUI"),
    string::utf8(b"USDC"),
    clock,
    ctx
);

// Mint 100 put options (need to deposit 150 USDC as collateral)
let usdc_collateral = coin::split(&mut usdc_balance, 150_000_000_000, ctx);

let (option_coins, owner_token) = options_pool::mint_put_options(
    pool,
    usdc_collateral,
    100_000_000_000,  // Amount: 100 SUI worth of puts
    clock,
    ctx
);
```

## Key Features

### 1. Fully Collateralized
- Call options: 100% backed by BaseAsset
- Put options: 100% backed by QuoteAsset at strike price

### 2. DeepBook Integration
- Price oracle: Real-time price from DeepBook spot pools
- Option tokens are standard Coins tradeable on DeepBook
- Permissionless liquidity pools for option tokens

### 3. American Style
- Options can be exercised any time before expiration
- Requires fresh price (< 5 minutes old)

### 4. Transparent Supply
- Total supply tracked on-chain
- Increases when minting
- Decreases when exercising/burning

### 5. Dual Token System
- **OPTION_TOKEN**: Tradeable coin representing the option right
- **OwnerToken**: Non-transferable token for claiming residual collateral

## Price Precision

All prices use 9 decimal precision (PRICE_DECIMALS = 1_000_000_000):
- Strike price 2.5 USDC = 2_500_000_000
- Current price 1.8 USDC = 1_800_000_000

## Security Considerations

1. **Price Staleness**: Exercise fails if price is >5 minutes old
2. **Expiration Checks**: Cannot exercise after expiration
3. **In-the-Money Check**: Can only exercise if profitable
4. **Collateral Verification**: All operations check sufficient collateral

## Trading Flow

```
1. Option Writer:
   Deposit Collateral → Mint OPTION_TOKENs → List on DeepBook → Earn Premium

2. Option Buyer:
   Buy OPTION_TOKENs from DeepBook → Exercise if ITM → Profit

3. Settlement:
   Anyone triggers settlement → Writers claim residual → Holders claim ITM value
```

## DeepBook Pool Creation

To enable trading of option tokens:

```move
// Create DeepBook pool: OPTION_TOKEN/USDC
// This allows market makers and traders to provide liquidity
// Option buyers pay USDC to buy OPTION_TOKENs
// Option sellers receive USDC when selling OPTION_TOKENs

use deepbook::pool;

// Admin creates the pool with appropriate parameters
pool::create_pool<OPTION_TOKEN, USDC>(
    tick_size,
    lot_size,
    min_size,
    // ... other params
);
```

## Events

All major actions emit events:
- `PoolCreated`: New option pool deployed
- `OptionsMinted`: Collateral deposited, supply increased
- `OptionsExercised`: Options burned, supply decreased
- `PriceUpdated`: Oracle price refreshed
- `PoolSettled`: Final settlement at expiration
- `CollateralClaimed`: Residual collateral withdrawn

## View Functions

```move
// Get pool information
let (option_type, strike, expiration, minted, supply, base_balance, quote_balance, settled, settlement_price) = 
    get_pool_info(pool);

// Get current price
let (price, last_update) = get_current_price(pool);

// Get circulating supply
let supply = get_option_supply(pool);

// Get token metadata
let (symbol, name, description, decimals, pool_id) = get_token_metadata(pool);
```

## Limitations

1. **Covered Options Only**: Only fully collateralized options (no naked writing)
2. **Single Asset**: Each pool is for one specific strike/expiration
3. **Price Oracle**: Dependent on DeepBook liquidity
4. **No Margin**: Cannot use leverage, must deposit full collateral

## Future Enhancements

1. **European Options**: Add support for European-style (exercise only at expiration)
2. **Partial Collateralization**: Enable margin/leverage for experienced traders
3. **Automated Market Making**: Built-in AMM for option token liquidity
4. **Composite Options**: Spreads, straddles, and other strategies
5. **Flash Exercise**: Atomic exercise + swap for instant profit taking
6. **Vault System**: Automated strategy vaults (covered calls, cash-secured puts)

## Testing

Run tests with:
```bash
sui move test
```

## Deployment

```bash
sui client publish --gas-budget 100000000
```

## License

MIT
