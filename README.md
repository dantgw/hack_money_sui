# Varuna

**A decentralized options exchange built on SUI's DeepBook protocol**

[![SUI](https://img.shields.io/badge/Powered%20by-SUI%20DeepBook-blue)](https://sui.io)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Problem Statement

DeFi options trading on Sui faces several gaps:

- **No native options infrastructure** — Sui’s DeFi ecosystem lacks options for
  hedging and speculation. Current DeFi projects are mostly AMMs,
  lending/borrowing protocols, and Perps.
- **Options Trading are currently centralized** — Centralized option apps like
  Robinhood are often paused during periods of intense trading, causing momentum
  to be lost. (Eg: Gamestop)

## Overview

**Varuna** is a decentralized options trading platform that enables users to
mint, trade, and exercise American-style call and put options. **Only covered
call and covered put options are created**—writers must deposit full collateral
(base asset for calls, quote asset for puts) before minting. This means users
are not exposed to the unlimited downside risk of naked options. By leveraging
SUI's native DeepBook order book protocol, Varuna brings institutional-grade
options infrastructure to the Sui blockchain—with permissionless pool creation,
fully collateralized options, and seamless composability with DeepBook's
existing liquidity network. We have also built a beautiful frontend interface
that integrates with DeepBook for spot trading and options management. The
design is mobile responsive and suitable for viewing on mobile devices.

### Key Features

- **American-Style Options** — Exercise call or put options at any time before
  expiration when in-the-money
- **DeepBook Integration** — Option tokens are standard `Coin<T>` types that can
  be traded on DeepBook order books
- **DeFi-Native Price Oracle** — Underlying asset prices sourced directly from
  DeepBook mid-price (no external oracles)
- **Permissionless Pools** — Create DeepBook liquidity pools for any option
  token / quote asset pair (500 DEEP fee)
- **Fully Collateralized / Covered Only** — Every option token is 1:1 backed by
  collateral; no pre-minting, no undercollateralization. Only covered calls and
  covered puts are supported—no naked options, so risk is bounded.
- **Modular Architecture** — Each option type (strike/expiry) is a separate
  token module; composable with Sui’s type system

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              VARUNA PLATFORM                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐        │
│   │   Options Chain   │     │  DeepBook Trade  │     │     Account     │        │
│   │  (Mint / Exercise)│     │ (Spot Trading)  │     │   (Portfolio)    │        │
│   └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘        │
│            │                        │                        │                   │
│            └────────────────────────┼────────────────────────┘                   │
│                                     │                                            │
│   ┌─────────────────────────────────▼─────────────────────────────────────────┐ │
│   │                      FRONTEND (React + Vite + Tailwind)                    │ │
│   │   @mysten/dapp-kit-react • @mysten/deepbook-v3 • @mysten/sui               │ │
│   └─────────────────────────────────┬─────────────────────────────────────────┘ │
│                                     │                                            │
│   ┌─────────────────────────────────▼─────────────────────────────────────────┐ │
│   │                        SUI BLOCKCHAIN                                       │ │
│   │   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │ │
│   │   │  Varuna Options  │  │  DeepBook        │  │  DEEP / SUI /    │         │ │
│   │   │  Pool (Move)     │  │  Order Book      │  │  USDC Coins      │         │ │
│   │   └──────────────────┘  └──────────────────┘  └──────────────────┘         │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
hack_money_sui/
├── move/
│   ├── varuna/                    # Core Move smart contracts
│   │   ├── sources/
│   │   │   ├── options_pool.move   # Mint, exercise, settle, claim logic
│   │   │   └── call_deep_sui_*.move
│   │   └── published/              # Deployment metadata
│   └── option_contracts/          # PUT and additional CALL modules
├── src/
│   ├── components/                 # React UI (trading, options, account)
│   ├── lib/deepbook.ts             # DeepBook SDK & indexer client
│   └── constants.ts                 # Package IDs, network config
└── vite.config.mts
```

## Repository Structure

| Path                                       | Description                                            |
| ------------------------------------------ | ------------------------------------------------------ |
| `move/varuna/`                             | Core Move smart contracts                              |
| `move/varuna/sources/options_pool.move`    | Options pool logic (mint, exercise, settle, claim)     |
| `move/varuna/sources/call_deep_sui_*.move` | Call option token modules                              |
| `move/option_contracts/`                   | Additional option token modules (PUT, various strikes) |
| `src/components/`                          | React UI components                                    |
| `src/lib/deepbook.ts`                      | DeepBook SDK integration & indexer client              |
| `src/constants.ts`                         | Package IDs, network config                            |

### Key Files

| File                                                           | Purpose                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `move/varuna/sources/options_pool.move`                        | Single-token options pool; manages one option type per pool        |
| `move/varuna/sources/call_deep_sui_100000000_exp20270101.move` | Example CALL option token (strike 0.10, exp Jan 2027)              |
| `move/option_contracts/put_deep_sui_30000000_exp20270101.move` | Example PUT option token (strike 0.03, exp Jan 2027)               |
| `src/components/DeepBookTrading.tsx`                           | Spot trading interface (charts, order book, order panel)           |
| `src/components/OptionsPage.tsx`                               | Options chain, mint, exercise, pool creation                       |
| `src/components/OptionsActionPanel.tsx`                        | Mint/Exercise/Update Price UI                                      |
| `src/components/OptionsChain.tsx`                              | Options chain table (calls vs puts by strike)                      |
| `src/lib/deepbook.ts`                                          | DeepBook client: pools, order book, OHLCV, trades, order placement |

---

## Technology Stack

### Smart Contracts (Move)

- **Sui Move **
- **DeepBook v3** — `deepbook` from
  [MystenLabs/deepbookv3](https://github.com/MystenLabs/deepbookv3)

### Frontend

| Technology             | Version | Purpose                              |
| ---------------------- | ------- | ------------------------------------ |
| React                  | 19.x    | UI framework                         |
| Vite                   | 7.x     | Build tool                           |
| TypeScript             | 5.9     | Type safety                          |
| Tailwind CSS           | 4.x     | Styling                              |
| @mysten/dapp-kit-react | 1.x     | Wallet & network                     |
| @mysten/deepbook-v3    | 1.x     | Order placement, limit/market orders |
| @mysten/sui            | 2.x     | RPC, transactions, BCS               |
| lightweight-charts     | 5.x     | Trading charts                       |
| react-router-dom       | 7.x     | Routing                              |

### Infrastructure

- **DeepBook Indexer** — OHLCV, order book, trades, pools
- **Sui JSON-RPC / gRPC** — Chain access

---

## Smart Contract Deep Dive

### 1. Options Pool (`options_pool.move`)

The pool manages a **single option type** (one strike, one expiration). It is
parameterized by:

- `OptionToken` — The option token type (e.g.
  `CALL_DEEP_SUI_20000000_EXP20270101`)
- `BaseAsset` — Underlying asset (e.g. `DEEP`)
- `QuoteAsset` — Quote/payment asset (e.g. `SUI`)

#### Core Structs

```move
OptionsPool<OptionToken, BaseAsset, QuoteAsset>
├── option_type        // 0 = Call, 1 = Put
├── strike_price       // 9-decimal precision (PRICE_DECIMALS)
├── expiration_date    // Unix timestamp (ms)
├── treasury_cap       // Mint/burn option tokens
├── collateral_balance_base  // BaseAsset locked
├── collateral_balance_quote // QuoteAsset locked
├── underlying_asset_price   // From DeepBook mid_price
├── deepbook_pool_id   // Price oracle reference
└── is_settled         // Post-expiration state

OwnerToken<OptionToken, BaseAsset, QuoteAsset>
├── amount             // 1:1 with option tokens minted
└── pool_id            // Reference to pool
```

#### Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CREATE    │───▶│    MINT     │───▶│   EXERCISE  │───▶│   SETTLE    │
│   POOL      │    │  OPTIONS    │    │  (pre-exp)  │    │  (post-exp) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                  │                   │
       │                   │                  │                   │
       ▼                   ▼                  ▼                   ▼
  create_pool()    mint_call_options()  exercise_call_options()  settle_pool()
                   mint_put_options()   exercise_put_options()   claim_collateral_*
                                                                 claim_with_*_options
```

#### Call Options

| Phase              | Action                    | Collateral       | Result                       |
| ------------------ | ------------------------- | ---------------- | ---------------------------- |
| **Mint**           | Deposit BaseAsset         | BaseAsset locked | Option coins + OwnerToken    |
| **Exercise** (ITM) | Pay QuoteAsset at strike  | Burns options    | Receive BaseAsset            |
| **Settlement**     | Pool settles              | —                | Writers claim via OwnerToken |
| **Claim (ITM)**    | Option holder pays strike | Burns options    | Receive BaseAsset            |

#### Put Options

| Phase              | Action                               | Collateral        | Result                       |
| ------------------ | ------------------------------------ | ----------------- | ---------------------------- |
| **Mint**           | Deposit QuoteAsset (strike × amount) | QuoteAsset locked | Option coins + OwnerToken    |
| **Exercise** (ITM) | Provide BaseAsset                    | Burns options     | Receive QuoteAsset           |
| **Settlement**     | Pool settles                         | —                 | Writers claim via OwnerToken |
| **Claim (ITM)**    | Option holder provides BaseAsset     | Burns options     | Receive QuoteAsset           |

#### Price Oracle

- `update_price()` — Fetches `mid_price` from the referenced DeepBook pool
- Anyone can call;
- Price must be updated within `MAX_PRICE_STALENESS_MS` (5 min) for exercise
- Exercise only allowed when `current_price > strike` (call) or
  `current_price < strike` (put)

#### Security

- **Covered options only** — Writers must lock full collateral (base for calls,
  quote for puts) before minting; no naked options, so downside risk is bounded
- **Zero pre-mint** — `create_pool` fails if
  `coin::total_supply(&treasury_cap) != 0`
- **Full collateralization** — 1:1 collateral per option
- **Type safety** — Each option is a distinct Move type

### 2. Option Token Modules

Each option (strike + expiry) is a separate module using the One-Time Witness
pattern:

```move
// Example: call_deep_sui_100000000_exp20270101.move
module varuna::call_deep_sui_100000000_exp20270101 {
    public struct CALL_DEEP_SUI_100000000_EXP20270101 has drop {}

    fun init(witness: CALL_DEEP_SUI_100000000_EXP20270101, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(...);
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    public fun create_pool<DEEP, USDC>(treasury_cap, deepbook_pool_id, clock, ctx): ID {
        options_pool::create_pool<CALL_DEEP_SUI_100000000_EXP20270101, DEEP, USDC>(
            treasury_cap, 0, STRIKE_PRICE, EXPIRATION_DATE, deepbook_pool_id, clock, ctx
        )
    }
}
```

---

## Frontend Components

### DeepBook Trading (`/`)

- **TradingChart** — OHLCV candlesticks (lightweight-charts)
- **OrderBook** — Level 2 order book from DeepBook Indexer
- **OrderPanel** — Limit/market orders via DeepBook SDK
- **AccountPanel** — Open orders, balance manager
- **PoolSelectorPopup** — Switch between DEEP_SUI, SUI_USDC, etc.

### Options (`/options`)

- **OptionsChain** — Strike/expiry matrix; calls vs puts
- **OptionsActionPanel** — Mint, Exercise, Update Price, Create Pool
- **Create Permissionless Pool** — Option token / SUI (or USDC) pools; 500 DEEP
  fee

### Account (`/account`)

- Portfolio overview, balances, positions

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Bun](https://bun.sh/) or npm
- [Sui CLI](https://docs.sui.io/build/install) (for publishing contracts)
- Sui wallet extension (e.g. Sui Wallet, Ethos)

### Quick Start

The smart contracts are already deployed to Sui testnet. See
[Deployed Contracts (Testnet)](#deployed-contracts-testnet) for Package IDs and
Pool IDs.

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd hack_money_sui
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Start the development server**

   ```bash
   bun run dev
   ```

4. **Access the application**
   - Open your browser at `http://localhost:5173` (or the URL shown in the
     terminal)
   - Connect your Sui wallet and switch to **testnet**
   - Trade spot on DeepBook or mint/exercise options on the Options page

### Build

```bash
bun run build
```

### Publish Move Contracts

```bash
cd move/varuna
sui client publish --gas-budget 100000000
```

After publishing, create the pool:

```bash
sui client call --package <PACKAGE_ID> \
  --module call_deep_sui_100000000_exp20270101 \
  --function create_pool \
  --args <TREASURY_CAP_ID> <DEEPBOOK_POOL_ID> 0x6 \
  --type-args <DEEP_TYPE> <SUI_TYPE> \
  --gas-budget 100000000
```

---

## Deployed Contracts (Testnet)

| Option                    | Package ID                                                           | Options Pool Module                                                                | Pool ID                                                              |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| CALL DEEP/SUI Strike 0.02 | `0x33083f7f56ad45645c8f17c6b92af2ccc38dda29202a52d86de3daaa137aec86` | `0x33083f7f56ad45645c8f17c6b92af2ccc38dda29202a52d86de3daaa137aec86::options_pool` | `0x48dec36157e3073bb5b0a41f9628a26a2b63929f70858271fc0698cee83545ec` |
| PUT DEEP/SUI Strike 0.03  | `0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427` | `0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427::options_pool` | `0x4cec5d3862ce4d9cd868e31d5afe48c16ad7345cf923c4bcd817e7672deb8b4c` |

The **Options Pool** module (`options_pool.move`) is the core contract that
manages mint, exercise, settle, and claim logic. Each deployed option package
includes this module—use the full module path above when calling `options_pool`
functions (e.g. `update_price`, `mint_call_options`, `exercise_call_options`).

---

## Error Codes Reference

| Code | Name                    | Description                       |
| ---- | ----------------------- | --------------------------------- |
| 0    | EPoolNotExpired         | Pool has not expired yet          |
| 1    | EPoolExpired            | Pool has expired                  |
| 2    | EPoolAlreadySettled     | Pool already settled              |
| 3    | EInsufficientCollateral | Not enough collateral             |
| 4    | EOptionNotExercisable   | Option out of the money           |
| 5    | EInvalidOptionType      | Wrong option type                 |
| 6    | EZeroAmount             | Amount must be > 0                |
| 7    | EPriceNotSet            | Price oracle not updated          |
| 8    | EInvalidStrikePrice     | Strike price must be positive     |
| 9    | EInvalidExpiration      | Expiration must be in the future  |
| 10   | EInvalidPoolReference   | Owner token doesn't match pool    |
| 11   | EPriceStale             | Price older than 5 minutes        |
| 12   | ENotAuthorized          | Operation not authorized          |
| 13   | ETokenSupplyNotZero     | TreasuryCap has pre-minted tokens |

---

## SUI Hackathon

Varuna is built for the SUI ecosystem hackathon. It demonstrates:

1. **DeepBook integration** — Options tokens as tradeable assets on DeepBook
   order books
2. **Permissionless DeFi** — Anyone can create option pools and DeepBook markets
3. **Composability** — Option tokens are standard `Coin<T>` and work with other
   Sui protocols
4. **Sui-native tooling** — Move 2024, OTW, phantom types, shared objects

---

## Caveat

⚠️ **Known limitations** — Please review before using:

- The options smart contracts have some flaws and might not perfectly work as
  intended.
- The options smart contracts are currently deployed individually, and are not
  entirely scaleable yet. A factory token contract was attempted but could not
  work due to Sui not allowing dynamic type at runtime.
- Once the option tokens have been minted, they cannot be cancelled and
  refunded.
- An attempt to create a pool on deepbook using the options token has not been
  attempted due to the minimum requirement of 500 DEEP tokens.
- The deepbook indexer sometimes goes down.
- The deepbook order book has no orders which causes the smart contract
  invocation to fail.

---

## Contributing

This project was developed as a hackathon submission. Contributions and feedback
are welcome!

---

## Links

- [Sui Documentation](https://docs.sui.io)
- [DeepBook v3](https://docs.sui.io/standards/deepbookv3)
- [DeepBook Indexer](https://docs.sui.io/standards/deepbookv3-indexer)

---

**Built with ❤️ for the Sui ecosystem**
