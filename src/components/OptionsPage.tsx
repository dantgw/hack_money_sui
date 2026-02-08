import { useState, useEffect } from "react";
import { useCurrentAccount, useDAppKit, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { ConnectButton } from "@mysten/dapp-kit-react";
import { Loader2, Calendar, DollarSign, RefreshCw, Zap, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { VARUNA_CALL_OPTIONS_PACKAGE_ID, VARUNA_PUT_OPTIONS_PACKAGE_ID } from "../constants";
import { getAllPools, createPermissionlessPool, POOL_CREATION_FEE_DEEP, DEEP_COIN_TYPE } from "../lib/deepbook";

interface OptionPool {
    id: string;
    name: string;
    type: "CALL" | "PUT";
    strikePrice: number;
    expirationDate: number;
    baseAsset: string;
    quoteAsset: string;
    optionTokenType: string;
    baseAssetType: string;
    quoteAssetType: string;
    packageId: string;
    /** DeepBook pool name for price oracle (e.g. DEEP_SUI) */
    deepbookPoolName: string;
    /** Option token decimals (6 for CALL, 9 for PUT in this config) */
    optionTokenDecimals?: number;
}

// Example option pools - in production, these would be fetched from on-chain
const PUBLISHED_OPTIONS: OptionPool[] = [
    // {
    //     id: "0x7410d17a4d65707149a919737faf0925423e4d517759d5b212b8878fb4c39af0",
    //     packageId: "0xc89c88f32b562e349c15f1c1e9c2c37eb64135e9730b8f8b75492ac72886f55e",
    //     name: "CALL DEEP/SUI Strike 0.10",
    //     type: "CALL",
    //     strikePrice: 0.1,
    //     expirationDate: 1798761600000, // Jan 1, 2027
    //     baseAsset: "DEEP",
    //     quoteAsset: "SUI",
    //     // optionTokenType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
    //     optionTokenType: "0xc89c88f32b562e349c15f1c1e9c2c37eb64135e9730b8f8b75492ac72886f55e::call_deep_sui_100000000_exp20270101::CALL_DEEP_SUI_100000000_EXP20270101",
    //     baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
    //     quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
    //     deepbookPoolName: "DEEP_SUI",
    //     optionTokenDecimals: 6,
    // },
    // {
    //     id: "0xfdc1eeb2d3737062be9bc050bb5080957f0f99169e6c11edf08a023fa4c1a7c8",
    //     packageId: "0xa924a8a13285caf94e162ee7bceb87ee407c8e645058ff6c7e0c4afc8dd55e29",
    //     name: "CALL DEEP/SUI Strike 0.03",
    //     type: "CALL",
    //     strikePrice: 0.03,
    //     expirationDate: 1798761600000, // Jan 1, 2027
    //     baseAsset: "DEEP",
    //     quoteAsset: "SUI",
    //     // optionTokenType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
    //     optionTokenType: "0xa924a8a13285caf94e162ee7bceb87ee407c8e645058ff6c7e0c4afc8dd55e29::call_deep_sui_30000000_exp20270101::CALL_DEEP_SUI_30000000_EXP20270101",
    //     baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
    //     quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
    //     deepbookPoolName: "DEEP_SUI",
    //     optionTokenDecimals: 6,
    // },
    {
        id: "0x48dec36157e3073bb5b0a41f9628a26a2b63929f70858271fc0698cee83545ec",
        packageId: "0x33083f7f56ad45645c8f17c6b92af2ccc38dda29202a52d86de3daaa137aec86",
        name: "CALL DEEP/SUI Strike 0.02",
        type: "CALL",
        strikePrice: 0.02,
        expirationDate: 1798761600000, // Jan 1, 2027
        baseAsset: "DEEP",
        quoteAsset: "SUI",
        optionTokenType: "0x33083f7f56ad45645c8f17c6b92af2ccc38dda29202a52d86de3daaa137aec86::call_deep_sui_20000000_exp20270101::CALL_DEEP_SUI_20000000_EXP20270101",
        baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
        quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
        deepbookPoolName: "DEEP_SUI",
        optionTokenDecimals: 6,
    },
    // {
    //     id: "0x4cec5d3862ce4d9cd868e31d5afe48c16ad7345cf923c4bcd817e7672deb8b4c",
    //     packageId: "0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427",
    //     name: "PUT DEEP/SUI Strike 0.03",
    //     type: "PUT",
    //     strikePrice: 0.03,
    //     expirationDate: 1798761600000, // Jan 1, 2027
    //     baseAsset: "DEEP",
    //     quoteAsset: "SUI",
    //     optionTokenType: "0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427::put_deep_sui_30000000_exp20270101::PUT_DEEP_SUI_30000000_EXP20270101",
    //     baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
    //     quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
    //     deepbookPoolName: "DEEP_SUI",
    //     optionTokenDecimals: 9,
    // },
];

const PRICE_DECIMALS = 1_000_000_000;

export function OptionsPage() {
    const currentAccount = useCurrentAccount();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();
    const [mintingPool, setMintingPool] = useState<string | null>(null);
    const [collateralAmounts, setCollateralAmounts] = useState<Record<string, string>>({});
    const [poolId, setPoolId] = useState<string>("");
    const [updatingPricePool, setUpdatingPricePool] = useState<string | null>(null);
    const [exercisingPool, setExercisingPool] = useState<string | null>(null);
    const [exerciseAmounts, setExerciseAmounts] = useState<Record<string, string>>({});
    const [deepbookPools, setDeepbookPools] = useState<Map<string, string>>(new Map());
    const [userTokenBalances, setUserTokenBalances] = useState<Record<string, string>>({});
    const [creatingPool, setCreatingPool] = useState(false);
    const [createPoolForm, setCreatePoolForm] = useState({
        baseAssetType: "",
        quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
        tickSize: 1000,
        lotSize: 1000,
        minSize: 10000,
    });

    const loadDeepbookPools = async () => {
        const network = currentNetwork as "mainnet" | "testnet" | "devnet";
        const pools = await getAllPools(network);
        const map = new Map<string, string>();
        pools.forEach((p) => map.set(p.poolName, p.poolId));
        setDeepbookPools(map);
    };

    useEffect(() => {
        loadDeepbookPools();
    }, [currentNetwork]);

    // Fetch user's option token and owner token balances for each pool
    const loadUserTokenBalances = async () => {
        if (!currentAccount?.address) {
            setUserTokenBalances({});
            return;
        }
        const network = currentNetwork as "mainnet" | "testnet" | "devnet";
        const rpcUrl = network === "mainnet"
            ? "https://fullnode.mainnet.sui.io:443"
            : network === "testnet"
                ? "https://fullnode.testnet.sui.io:443"
                : "https://fullnode.devnet.sui.io:443";
        const jsonRpcClient = new SuiJsonRpcClient({ network, url: rpcUrl });
        const balances: Record<string, string> = {};
        for (const option of PUBLISHED_OPTIONS) {
            const decimals = option.optionTokenDecimals ?? 9;
            const div = Math.pow(10, decimals);
            const optionCoins = await jsonRpcClient.getCoins({
                owner: currentAccount.address,
                coinType: option.optionTokenType,
            });
            const optionBalance = optionCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
            balances[option.id] = (Number(optionBalance) / div).toLocaleString(undefined, { maximumFractionDigits: decimals });
        }
        setUserTokenBalances(balances);
    };

    useEffect(() => {
        loadUserTokenBalances();
    }, [currentAccount?.address, currentNetwork]);

    const handleMintOptions = async (option: OptionPool) => {
        if (!currentAccount?.address) {
            toast.error("Please connect your wallet");
            return;
        }
        console.log("Minting options for", option);
        const poolIdToUse = poolId || option.id;
        if (!poolIdToUse) {
            toast.error("Pool ID is required", {
                description: "Please enter the pool ID for this option",
            });
            return;
        }

        const collateralAmount = collateralAmounts[option.id] ?? "";
        if (!collateralAmount || parseFloat(collateralAmount) <= 0) {
            toast.error("Invalid collateral amount", {
                description: "Please enter a valid collateral amount",
            });
            return;
        }

        const network = currentNetwork as "mainnet" | "testnet" | "devnet";
        const packageId = option.type === "CALL" ? VARUNA_CALL_OPTIONS_PACKAGE_ID[network] : VARUNA_PUT_OPTIONS_PACKAGE_ID[network];

        if (!packageId) {
            toast.error("Package not deployed", {
                description: `Varuna options package is not deployed on ${network}`,
            });
            return;
        }

        setMintingPool(option.id);

        try {
            const network = currentNetwork as "mainnet" | "testnet" | "devnet";
            const rpcUrl = network === "mainnet"
                ? "https://fullnode.mainnet.sui.io:443"
                : network === "testnet"
                    ? "https://fullnode.testnet.sui.io:443"
                    : "https://fullnode.devnet.sui.io:443";

            // Get user's coins of the base asset type using JSON RPC client
            const jsonRpcClient = new SuiJsonRpcClient({ network, url: rpcUrl });
            const coins = await jsonRpcClient.getCoins({
                owner: currentAccount.address,
                coinType: option.type === "CALL" ? option.baseAssetType : option.quoteAssetType,
            });

            if (coins.data.length === 0) {
                const requiredAsset = option.type === "CALL" ? option.baseAsset : option.quoteAsset;
                toast.error("Insufficient balance", {
                    description: `You don't have any ${requiredAsset} coins. Please acquire some first.`,
                });
                setMintingPool(null);
                return;
            }

            // Convert collateral amount to base units
            const amountInBaseUnits = BigInt(Math.floor(parseFloat(collateralAmount) * Math.pow(10, 6)));
            const amountInQuoteUnits = BigInt(Math.floor(parseFloat(collateralAmount) * Math.pow(10, 9)));

            const tx = new Transaction();
            tx.setSender(currentAccount.address);

            // Get all coin object IDs
            const coinObjectIds = coins.data.map((coin) => coin.coinObjectId);

            // For PUT options: calculate amount of options to mint based on collateral
            // required_collateral = (strike_price * amount) / PRICE_DECIMALS
            // So: amount = (collateral * PRICE_DECIMALS) / strike_price
            // PRICE_DECIMALS = 1_000_000_000 (9 decimals)
            const PRICE_DECIMALS = option.type === "CALL" ? BigInt(1_000_000_000) : BigInt(1_000_000);
            const strikePriceInBaseUnits = BigInt(Math.floor(option.strikePrice * Number(PRICE_DECIMALS)));

            let amountToMint: bigint;
            let collateralCoin;
            let remainderCoinId = coinObjectIds[0];
            let includeRemainder = true;

            if (option.type === "CALL") {
                // For CALL: collateral is BaseAsset (not SUI), merge coins if needed
                if (coinObjectIds.length > 1) {
                    tx.mergeCoins(
                        tx.object(coinObjectIds[0]),
                        coinObjectIds.slice(1).map((id) => tx.object(id))
                    );
                }
                // For CALL: collateral is BaseAsset, amount is the collateral amount
                amountToMint = amountInBaseUnits;
                const [splitCoin] = tx.splitCoins(tx.object(coinObjectIds[0]), [amountInBaseUnits]);
                collateralCoin = splitCoin;
            } else {
                // For PUT: split collateral from tx.gas - wallet picks coin for gas, we split collateral from it
                const GAS_RESERVE_MIST = 200_000_000n; // 0.2 SUI - must leave enough for gas
                const totalRequired = amountInQuoteUnits + GAS_RESERVE_MIST;
                const totalBalance = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
                if (totalBalance < totalRequired) {
                    toast.error("Insufficient SUI for collateral + gas", {
                        description: `Need ${(Number(amountInQuoteUnits) / 1e9).toFixed(4)} SUI + ~0.2 SUI for gas`,
                    });
                    setMintingPool(null);
                    return;
                }
                amountToMint = (amountInQuoteUnits * PRICE_DECIMALS) / strikePriceInBaseUnits;
                const [splitCoin] = tx.splitCoins(tx.gas, [Number(amountInQuoteUnits)]);
                collateralCoin = splitCoin;
                includeRemainder = false; // No remainder to transfer - gas coin handled by wallet
            }

            const optionArguments = option.type === "CALL" ? [
                tx.object(poolIdToUse), // pool: &mut OptionsPool
                collateralCoin, // collateral: Coin<BaseAsset>
                tx.object.clock(), // clock: &Clock
            ] : [
                tx.object(poolIdToUse), // pool: &mut OptionsPool
                collateralCoin, // collateral: Coin<QuoteAsset>
                tx.pure.u64(amountToMint), // amount: u64 (wrapped with tx.pure)
                tx.object.clock(), // clock: &Clock
            ];
            // Call mint_call_options - returns (option_coins, owner_token)
            const [optionCoins, ownerToken] = tx.moveCall({
                target: option.type === "CALL" ? `${option.packageId}::options_pool::mint_call_options` : `${option.packageId}::options_pool::mint_put_options`,
                typeArguments: [
                    option.optionTokenType,
                    option.baseAssetType,
                    option.quoteAssetType,
                ],
                arguments: optionArguments as any,
            });

            // Transfer objects to the user: option coins, owner token, and remainder (for CALL only - PUT uses tx.gas)
            const toTransfer: Parameters<typeof tx.transferObjects>[0] = [
                optionCoins,
                ownerToken,
                ...(includeRemainder ? [tx.object(remainderCoinId)] : []),
            ];
            tx.transferObjects(toTransfer, currentAccount.address);
            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === "FailedTransaction") {
                throw new Error("Transaction failed");
            }

            const collateralAsset = option.type === "CALL" ? option.baseAsset : option.quoteAsset;
            toast.success("Options minted successfully!", {
                description: `Minted options with ${collateralAmount} ${collateralAsset} collateral`,
            });
            loadUserTokenBalances();

            // Clear form for this option
            setCollateralAmounts((prev) => {
                const next = { ...prev };
                delete next[option.id];
                return next;
            });
            setPoolId("");
        } catch (error) {
            console.error("Mint failed:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            toast.error("Mint failed", {
                description: errorMessage,
            });
        } finally {
            setMintingPool(null);
        }
    };

    const handleUpdatePrice = async (option: OptionPool) => {
        if (!currentAccount?.address) {
            toast.error("Please connect your wallet");
            return;
        }
        const poolIdToUse = poolId || option.id;
        if (!poolIdToUse) {
            toast.error("Pool ID is required");
            return;
        }
        const deepbookPoolId = deepbookPools.get(option.deepbookPoolName);
        if (!deepbookPoolId) {
            toast.error("DeepBook pool not found", {
                description: `Could not find pool ${option.deepbookPoolName}. Ensure you're on the correct network.`,
            });
            return;
        }

        setUpdatingPricePool(option.id);
        try {
            const tx = new Transaction();
            tx.setSender(currentAccount.address);
            tx.moveCall({
                target: `${option.packageId}::options_pool::update_price`,
                typeArguments: [option.optionTokenType, option.baseAssetType, option.quoteAssetType],
                arguments: [
                    tx.object(poolIdToUse),
                    tx.object(deepbookPoolId),
                    tx.object.clock(),
                ],
            });
            const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            if (result.$kind === "FailedTransaction") throw new Error("Transaction failed");
            toast.success("Price updated successfully");
        } catch (error) {
            console.error("Update price failed:", error);
            toast.error("Update price failed", {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setUpdatingPricePool(null);
        }
    };

    const handleExerciseOptions = async (option: OptionPool) => {
        if (!currentAccount?.address) {
            toast.error("Please connect your wallet");
            return;
        }
        const poolIdToUse = poolId || option.id;
        if (!poolIdToUse) {
            toast.error("Pool ID is required");
            return;
        }
        const exerciseAmount = exerciseAmounts[option.id] ?? "";
        const amount = parseFloat(exerciseAmount);
        if (!exerciseAmount || amount <= 0) {
            toast.error("Invalid amount", { description: "Enter amount of options to exercise" });
            return;
        }
        const network = currentNetwork as "mainnet" | "testnet" | "devnet";

        setExercisingPool(option.id);
        try {
            const rpcUrl = network === "mainnet"
                ? "https://fullnode.mainnet.sui.io:443"
                : network === "testnet"
                    ? "https://fullnode.testnet.sui.io:443"
                    : "https://fullnode.devnet.sui.io:443";
            const jsonRpcClient = new SuiJsonRpcClient({ network, url: rpcUrl });

            const deepbookPoolId = deepbookPools.get(option.deepbookPoolName);
            if (!deepbookPoolId) {
                toast.error("DeepBook pool not found", {
                    description: `Could not find pool ${option.deepbookPoolName}. Update price first or ensure you're on the correct network.`,
                });
                setExercisingPool(null);
                return;
            }

            const tx = new Transaction();
            tx.setSender(currentAccount.address);

            // Refresh price from DeepBook before exercise (required: price must be < 5 min old)
            tx.moveCall({
                target: `${option.packageId}::options_pool::update_price`,
                typeArguments: [option.optionTokenType, option.baseAssetType, option.quoteAssetType],
                arguments: [
                    tx.object(poolIdToUse),
                    tx.object(deepbookPoolId),
                    tx.object.clock(),
                ],
            });

            const optionDecimals = option.optionTokenDecimals ?? 9;
            const amountInBaseUnits = BigInt(Math.floor(amount * Math.pow(10, optionDecimals)));

            if (option.type === "CALL") {
                const strikePriceInBaseUnits = BigInt(Math.floor(option.strikePrice * PRICE_DECIMALS));
                const requiredPayment = (strikePriceInBaseUnits * amountInBaseUnits) / BigInt(PRICE_DECIMALS);

                const GAS_RESERVE_MIST = 200_000_000n; // 0.2 SUI - must leave enough for gas
                const totalRequired = requiredPayment + GAS_RESERVE_MIST;

                const optionCoins = await jsonRpcClient.getCoins({
                    owner: currentAccount.address,
                    coinType: option.optionTokenType,
                });
                const paymentCoins = await jsonRpcClient.getCoins({
                    owner: currentAccount.address,
                    coinType: option.quoteAssetType,
                });
                if (optionCoins.data.length === 0) {
                    toast.error("No option coins", { description: "You don't have any option tokens to exercise" });
                    return;
                }
                if (paymentCoins.data.length === 0) {
                    toast.error("No payment coins", { description: "You don't have any payment coins to exercise" });
                    return;
                }

                const totalPaymentBalance = paymentCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
                if (totalPaymentBalance < totalRequired) {
                    toast.error("Insufficient SUI for payment + gas", {
                        description: `Need ${(Number(requiredPayment) / 1e9).toFixed(4)} ${option.quoteAsset} for strike + ~0.2 SUI for gas`,
                    });
                    setExercisingPool(null);
                    return;
                }

                const totalOptionBalance = optionCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
                if (totalOptionBalance < amountInBaseUnits) {
                    toast.error("Insufficient option tokens", { description: `You need at least ${amount} options` });
                    return;
                }

                // Split payment from tx.gas - wallet picks a coin for gas, we split payment from it
                // Keeps our coins unused so wallet can select one for gas; remainder pays gas and returns to user
                const [paymentCoin] = tx.splitCoins(tx.gas, [Number(requiredPayment)]);

                // Merge option tokens first, then split the needed amount, then send rest back to owner
                const optionCoinIds = optionCoins.data.map((c) => c.coinObjectId);
                if (optionCoinIds.length > 1) {
                    tx.mergeCoins(
                        tx.object(optionCoinIds[0]),
                        optionCoinIds.slice(1).map((id) => tx.object(id))
                    );
                }
                const primaryOptionCoinId = optionCoinIds[0];
                const [optionCoin] = tx.splitCoins(tx.object(primaryOptionCoinId), [Number(amountInBaseUnits)]);

                const [payoutCoin] = tx.moveCall({
                    target: `${option.packageId}::options_pool::exercise_call_options`,
                    typeArguments: [option.optionTokenType, option.baseAssetType, option.quoteAssetType],
                    arguments: [
                        tx.object(poolIdToUse),
                        optionCoin,
                        paymentCoin,
                        tx.object.clock(),
                    ],
                });
                // Return payout and remainder of option coin; gas coin remainder is returned by wallet
                tx.transferObjects(
                    [payoutCoin, tx.object(primaryOptionCoinId)],
                    currentAccount.address
                );
            } else {
                const optionCoins = await jsonRpcClient.getCoins({
                    owner: currentAccount.address,
                    coinType: option.optionTokenType,
                });
                const baseCoins = await jsonRpcClient.getCoins({
                    owner: currentAccount.address,
                    coinType: option.baseAssetType,
                });
                if (optionCoins.data.length === 0) {
                    toast.error("No option coins", { description: "You don't have any option tokens to exercise" });
                    return;
                }
                const totalBaseBalance = baseCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
                const totalOptionBalance = optionCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
                if (baseCoins.data.length === 0 || totalBaseBalance < amountInBaseUnits) {
                    console.log("Insufficient base asset", {
                        amountInBaseUnits,
                        baseCoins: baseCoins.data.map((c) => ({
                            balance: BigInt(c.balance),
                            coinObjectId: c.coinObjectId,
                        })),
                    });
                    toast.error("Insufficient base asset", {
                        description: `You need ${amount} ${option.baseAsset} to exercise`,
                    });
                    return;
                }
                if (totalOptionBalance < amountInBaseUnits) {
                    toast.error("Insufficient option tokens", { description: `You need at least ${amount} options` });
                    return;
                }

                // Merge option tokens first, then split the needed amount, then send rest back to owner
                const optionCoinIds = optionCoins.data.map((c) => c.coinObjectId);
                if (optionCoinIds.length > 1) {
                    tx.mergeCoins(
                        tx.object(optionCoinIds[0]),
                        optionCoinIds.slice(1).map((id) => tx.object(id))
                    );
                }
                const primaryOptionCoinId = optionCoinIds[0];
                const [optionCoin] = tx.splitCoins(tx.object(primaryOptionCoinId), [Number(amountInBaseUnits)]);

                // Merge base asset coins if needed, then split
                const baseCoinIds = baseCoins.data.map((c) => c.coinObjectId);
                if (baseCoinIds.length > 1) {
                    tx.mergeCoins(
                        tx.object(baseCoinIds[0]),
                        baseCoinIds.slice(1).map((id) => tx.object(id))
                    );
                }
                const primaryBaseCoinId = baseCoinIds[0];
                const [baseCoin] = tx.splitCoins(tx.object(primaryBaseCoinId), [Number(amountInBaseUnits)]);

                const [payoutCoin] = tx.moveCall({
                    target: `${option.packageId}::options_pool::exercise_put_options`,
                    typeArguments: [option.optionTokenType, option.baseAssetType, option.quoteAssetType],
                    arguments: [
                        tx.object(poolIdToUse),
                        optionCoin,
                        baseCoin,
                        tx.object.clock(),
                    ],
                });
                tx.transferObjects(
                    [payoutCoin, tx.object(primaryOptionCoinId), tx.object(primaryBaseCoinId)],
                    currentAccount.address
                );
            }

            const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            if (result.$kind === "FailedTransaction") throw new Error("Transaction failed");
            toast.success("Options exercised successfully");
            loadUserTokenBalances();
            setExerciseAmounts((prev) => {
                const next = { ...prev };
                delete next[option.id];
                return next;
            });
        } catch (error) {
            console.error("Exercise failed:", error);
            toast.error("Exercise failed", {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setExercisingPool(null);
        }
    };

    const handleCreatePermissionlessPool = async () => {
        if (!currentAccount?.address) {
            toast.error("Please connect your wallet");
            return;
        }
        const { baseAssetType, quoteAssetType, tickSize, lotSize, minSize } = createPoolForm;
        if (!baseAssetType || !quoteAssetType) {
            toast.error("Invalid params", { description: "Base and quote asset types are required" });
            return;
        }
        if (baseAssetType === quoteAssetType) {
            toast.error("Invalid params", { description: "Base and quote assets must be different" });
            return;
        }

        const network = currentNetwork as "mainnet" | "testnet" | "devnet";
        const networkKey = network === "devnet" ? "testnet" : network;
        const deepType = DEEP_COIN_TYPE[networkKey];

        setCreatingPool(true);
        try {
            const rpcUrl = network === "mainnet"
                ? "https://fullnode.mainnet.sui.io:443"
                : network === "testnet"
                    ? "https://fullnode.testnet.sui.io:443"
                    : "https://fullnode.devnet.sui.io:443";
            const jsonRpcClient = new SuiJsonRpcClient({ network, url: rpcUrl });

            const deepCoins = await jsonRpcClient.getCoins({
                owner: currentAccount.address,
                coinType: deepType,
            });
            const totalDeep = deepCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
            if (totalDeep < POOL_CREATION_FEE_DEEP) {
                toast.error("Insufficient DEEP", {
                    description: `Need 500 DEEP for pool creation. You have ${(Number(totalDeep) / 1e6).toFixed(2)} DEEP.`,
                });
                setCreatingPool(false);
                return;
            }

            const tx = new Transaction();
            tx.setSender(currentAccount.address);

            const coinIds = deepCoins.data.map((c) => c.coinObjectId);
            if (coinIds.length > 1) {
                tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map((id) => tx.object(id)));
            }
            const [creationFeeCoin] = tx.splitCoins(tx.object(coinIds[0]), [Number(POOL_CREATION_FEE_DEEP)]);

            createPermissionlessPool(tx, {
                baseAssetType,
                quoteAssetType,
                tickSize,
                lotSize,
                minSize,
                creationFeeCoin,
            }, network);

            tx.transferObjects([tx.object(coinIds[0])], currentAccount.address);

            const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            if (result.$kind === "FailedTransaction") throw new Error("Transaction failed");
            toast.success("DeepBook pool created successfully");
            loadDeepbookPools();
        } catch (error) {
            console.error("Create pool failed:", error);
            toast.error("Create pool failed", {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setCreatingPool(false);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const isExpired = (expirationDate: number) => {
        return Date.now() >= expirationDate;
    };

    return (
        <div className="h-full min-h-0 overflow-auto p-4 sm:p-6 bg-background">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold">Options Management</h2>
                        <p className="text-muted-foreground mt-1">
                            Mint and trade options powered by Varuna
                        </p>
                    </div>
                    {!currentAccount && <ConnectButton />}
                </div>

                {currentAccount && (
                    <Card className="overflow-hidden">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <PlusCircle className="h-5 w-5" />
                                Create Permissionless DeepBook Pool
                            </CardTitle>
                            <CardDescription>
                                Create a new DeepBook pool for any BaseAsset/QuoteAsset pair. Requires 500 DEEP as creation fee. Tick size, lot size, and min size must be powers of 10.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">Base Asset Type</label>
                                    <input
                                        type="text"
                                        value={createPoolForm.baseAssetType}
                                        onChange={(e) => setCreatePoolForm((p) => ({ ...p, baseAssetType: e.target.value }))}
                                        placeholder="0x...::module::TYPE"
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                                    />
                                    {PUBLISHED_OPTIONS.length > 0 && (
                                        <select
                                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                            onChange={(e) => {
                                                const opt = PUBLISHED_OPTIONS.find((o) => o.optionTokenType === e.target.value);
                                                if (opt) setCreatePoolForm((p) => ({ ...p, baseAssetType: opt.optionTokenType }));
                                            }}
                                        >
                                            <option value="">Or select option token...</option>
                                            {PUBLISHED_OPTIONS.map((o) => (
                                                <option key={o.id} value={o.optionTokenType}>{o.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">Quote Asset Type</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                        value={createPoolForm.quoteAssetType}
                                        onChange={(e) => setCreatePoolForm((p) => ({ ...p, quoteAssetType: e.target.value }))}
                                    >
                                        <option value="0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI">SUI</option>
                                        <option value="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC">USDC (testnet)</option>
                                        <option value="0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC">USDC (mainnet)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">Tick Size</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.tickSize}
                                        onChange={(e) => setCreatePoolForm((p) => ({ ...p, tickSize: parseInt(e.target.value) || 1000 }))}
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">Lot Size (≥1000)</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.lotSize}
                                        onChange={(e) => setCreatePoolForm((p) => ({ ...p, lotSize: parseInt(e.target.value) || 1000 }))}
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">Min Size</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.minSize}
                                        onChange={(e) => setCreatePoolForm((p) => ({ ...p, minSize: parseInt(e.target.value) || 10000 }))}
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={handleCreatePermissionlessPool}
                                disabled={creatingPool || !createPoolForm.baseAssetType || !createPoolForm.quoteAssetType}
                                loading={creatingPool}
                            >
                                {creatingPool ? "Creating..." : "Create Pool (500 DEEP)"}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {PUBLISHED_OPTIONS.map((option) => (
                        <Card key={option.id || option.name} className="overflow-hidden">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg">{option.name}</CardTitle>
                                        <CardDescription>
                                            {option.type} Option • {option.baseAsset}/{option.quoteAsset}
                                        </CardDescription>
                                    </div>
                                    <div
                                        className={`px-2 py-1 rounded text-xs font-semibold ${option.type === "CALL"
                                            ? "bg-green-500/20 text-green-600"
                                            : "bg-red-500/20 text-red-600"
                                            }`}
                                    >
                                        {option.type}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <DollarSign className="h-3 w-3" />
                                            Strike Price
                                        </span>
                                        <span className="font-medium">
                                            {option.strikePrice} {option.quoteAsset}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            Expiration
                                        </span>
                                        <span className="font-medium">
                                            {formatDate(option.expirationDate)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Status</span>
                                        <span
                                            className={`font-medium ${isExpired(option.expirationDate)
                                                ? "text-red-500"
                                                : "text-green-500"
                                                }`}
                                        >
                                            {isExpired(option.expirationDate) ? "Expired" : "Active"}
                                        </span>
                                    </div>
                                    {currentAccount && userTokenBalances[option.id] && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground flex items-center gap-1">
                                                <Zap className="h-3 w-3" />
                                                Your Option Tokens
                                            </span>
                                            <span className="font-medium">
                                                {userTokenBalances[option.id]}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {currentAccount ? (
                                    <div className="space-y-3 pt-2 border-t">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleUpdatePrice(option)}
                                            disabled={
                                                updatingPricePool === option.id ||
                                                isExpired(option.expirationDate) ||
                                                !deepbookPools.has(option.deepbookPoolName)
                                            }
                                            className="w-full"
                                        >
                                            {updatingPricePool === option.id ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Updating...
                                                </>
                                            ) : (
                                                <>
                                                    <RefreshCw className="h-4 w-4" />
                                                    Update Price
                                                </>
                                            )}
                                        </Button>

                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground uppercase font-bold">
                                                Collateral ({option.type === "CALL" ? option.baseAsset : option.quoteAsset})
                                            </label>
                                            <input
                                                type="number"
                                                value={collateralAmounts[option.id] ?? ""}
                                                onChange={(e) => setCollateralAmounts((prev) => ({ ...prev, [option.id]: e.target.value }))}
                                                placeholder="0.00"
                                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                                disabled={mintingPool === option.id || isExpired(option.expirationDate)}
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleMintOptions(option)}
                                            disabled={
                                                mintingPool === option.id ||
                                                isExpired(option.expirationDate) ||
                                                !(collateralAmounts[option.id] ?? "") ||
                                                parseFloat(collateralAmounts[option.id] ?? "0") <= 0
                                            }
                                            className="w-full"
                                            loading={mintingPool === option.id}
                                        >
                                            {mintingPool === option.id ? "Minting..." : "Mint Options"}
                                        </Button>

                                        <div className="space-y-1.5 pt-2 border-t">
                                            <label className="text-xs text-muted-foreground uppercase font-bold">
                                                Exercise ({option.type === "CALL" ? `Pay ${option.quoteAsset}, get ${option.baseAsset}` : `Sell ${option.baseAsset}, get ${option.quoteAsset}`})
                                            </label>
                                            <input
                                                type="number"
                                                value={exerciseAmounts[option.id] ?? ""}
                                                onChange={(e) => setExerciseAmounts((prev) => ({ ...prev, [option.id]: e.target.value }))}
                                                placeholder="Amount to exercise"
                                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                                disabled={exercisingPool === option.id || isExpired(option.expirationDate)}
                                            />
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleExerciseOptions(option)}
                                                disabled={
                                                    exercisingPool === option.id ||
                                                    isExpired(option.expirationDate) ||
                                                    !(exerciseAmounts[option.id] ?? "") ||
                                                    parseFloat(exerciseAmounts[option.id] ?? "0") <= 0
                                                }
                                                className="w-full"
                                                loading={exercisingPool === option.id}
                                            >
                                                {exercisingPool === option.id ? (
                                                    "Exercising..."
                                                ) : (
                                                    <>
                                                        <Zap className="h-4 w-4" />
                                                        Exercise Options
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-2 border-t">
                                        <div className="w-full [&>button]:w-full">
                                            <ConnectButton />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {PUBLISHED_OPTIONS.length === 0 && (
                    <Card className="p-8 text-center">
                        <p className="text-muted-foreground">No options available</p>
                    </Card>
                )}
            </div>
        </div>
    );
}

