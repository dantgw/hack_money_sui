import { useState, useEffect } from "react";
import { useCurrentAccount, useDAppKit, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { ConnectButton } from "@mysten/dapp-kit-react";
import { Loader2, Calendar, DollarSign, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { VARUNA_CALL_OPTIONS_PACKAGE_ID, VARUNA_PUT_OPTIONS_PACKAGE_ID } from "../constants";
import { getAllPools } from "../lib/deepbook";

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
const EXAMPLE_OPTIONS: OptionPool[] = [
    {
        id: "0x77a55a7f355f449db59fa7de7f957c79c211a0a893f7ba01115cf2e9c00db58e",
        packageId: "0x90ebb5c0022ffe4c504f122bc3035b7fda9858464be430a58a41695ca146aae8",
        name: "CALL DEEP/SUI Strike 0.03",
        type: "CALL",
        strikePrice: 0.03,
        expirationDate: 1798761600000, // Jan 1, 2027
        baseAsset: "DEEP",
        quoteAsset: "SUI",
        // optionTokenType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
        optionTokenType: "0x90ebb5c0022ffe4c504f122bc3035b7fda9858464be430a58a41695ca146aae8::call_deep_sui_30000000_exp20270101::CALL_DEEP_SUI_30000000_EXP20270101",
        baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
        quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
        deepbookPoolName: "DEEP_SUI",
        optionTokenDecimals: 6,
    },
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
    {
        id: "0x4cec5d3862ce4d9cd868e31d5afe48c16ad7345cf923c4bcd817e7672deb8b4c",
        packageId: "0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427",
        name: "PUT DEEP/SUI Strike 0.03",
        type: "PUT",
        strikePrice: 0.03,
        expirationDate: 1798761600000, // Jan 1, 2027
        baseAsset: "DEEP",
        quoteAsset: "SUI",
        optionTokenType: "0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427::put_deep_sui_30000000_exp20270101::PUT_DEEP_SUI_30000000_EXP20270101",
        baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
        quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
        deepbookPoolName: "DEEP_SUI",
        optionTokenDecimals: 9,
    },
];

const PRICE_DECIMALS = 1_000_000_000;

export function OptionsPage() {
    const currentAccount = useCurrentAccount();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();
    const [mintingPool, setMintingPool] = useState<string | null>(null);
    const [collateralAmount, setCollateralAmount] = useState<string>("");
    const [poolId, setPoolId] = useState<string>("");
    const [updatingPricePool, setUpdatingPricePool] = useState<string | null>(null);
    const [exercisingPool, setExercisingPool] = useState<string | null>(null);
    const [exerciseAmount, setExerciseAmount] = useState<string>("");
    const [deepbookPools, setDeepbookPools] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        const load = async () => {
            const network = currentNetwork as "mainnet" | "testnet" | "devnet";
            const pools = await getAllPools(network);
            const map = new Map<string, string>();
            pools.forEach((p) => map.set(p.poolName, p.poolId));
            setDeepbookPools(map);
        };
        load();
    }, [currentNetwork]);

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

            // Clear form
            setCollateralAmount("");
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

                // Split payment from tx.gas - wallet picks a coin for gas, we split payment from it
                // Keeps our coins unused so wallet can select one for gas; remainder pays gas and returns to user
                const [paymentCoin] = tx.splitCoins(tx.gas, [Number(requiredPayment)]);

                const optionCoinsWithBalance = optionCoins.data
                    .filter((c) => BigInt(c.balance) >= amountInBaseUnits)
                    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
                if (optionCoinsWithBalance.length === 0) {
                    toast.error("No single option coin has enough", { description: `You need at least ${amount} options` });
                    return;
                }
                const optionCoinId = optionCoinsWithBalance[0].coinObjectId;
                const [optionCoin] = tx.splitCoins(tx.object(optionCoinId), [Number(amountInBaseUnits)]);

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
                    [payoutCoin, tx.object(optionCoinId)],
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
                if (baseCoins.data.length === 0 || baseCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n) < amountInBaseUnits) {
                    toast.error("Insufficient base asset", {
                        description: `You need ${amount} ${option.baseAsset} to exercise`,
                    });
                    return;
                }
                const baseCoinsWithBalance = baseCoins.data
                    .filter((c) => BigInt(c.balance) >= amountInBaseUnits)
                    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
                const optionCoinsWithBalance = optionCoins.data
                    .filter((c) => BigInt(c.balance) >= amountInBaseUnits)
                    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
                if (baseCoinsWithBalance.length === 0 || optionCoinsWithBalance.length === 0) {
                    toast.error("No single coin has enough balance", { description: "Try consolidating" });
                    return;
                }
                const baseCoinId = baseCoinsWithBalance[0].coinObjectId;
                const optionCoinId = optionCoinsWithBalance[0].coinObjectId;
                const [optionCoin] = tx.splitCoins(tx.object(optionCoinId), [Number(amountInBaseUnits)]);
                const [baseCoin] = tx.splitCoins(tx.object(baseCoinId), [Number(amountInBaseUnits)]);
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
                    [payoutCoin, tx.object(optionCoinId), tx.object(baseCoinId)],
                    currentAccount.address
                );
            }

            const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            if (result.$kind === "FailedTransaction") throw new Error("Transaction failed");
            toast.success("Options exercised successfully");
            setExerciseAmount("");
        } catch (error) {
            console.error("Exercise failed:", error);
            toast.error("Exercise failed", {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setExercisingPool(null);
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


                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {EXAMPLE_OPTIONS.map((option) => (
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
                                                value={collateralAmount}
                                                onChange={(e) => setCollateralAmount(e.target.value)}
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
                                                !collateralAmount ||
                                                parseFloat(collateralAmount) <= 0
                                            }
                                            className="w-full"
                                            loading={mintingPool === option.id}
                                        >
                                            {mintingPool === option.id ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Minting...
                                                </>
                                            ) : (
                                                "Mint Options"
                                            )}
                                        </Button>

                                        <div className="space-y-1.5 pt-2 border-t">
                                            <label className="text-xs text-muted-foreground uppercase font-bold">
                                                Exercise ({option.type === "CALL" ? `Pay ${option.quoteAsset}, get ${option.baseAsset}` : `Sell ${option.baseAsset}, get ${option.quoteAsset}`})
                                            </label>
                                            <input
                                                type="number"
                                                value={exerciseAmount}
                                                onChange={(e) => setExerciseAmount(e.target.value)}
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
                                                    !exerciseAmount ||
                                                    parseFloat(exerciseAmount) <= 0
                                                }
                                                className="w-full"
                                                loading={exercisingPool === option.id}
                                            >
                                                {exercisingPool === option.id ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Exercising...
                                                    </>
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

                {EXAMPLE_OPTIONS.length === 0 && (
                    <Card className="p-8 text-center">
                        <p className="text-muted-foreground">No options available</p>
                    </Card>
                )}
            </div>
        </div>
    );
}

