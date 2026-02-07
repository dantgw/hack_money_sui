import { useState } from "react";
import { useCurrentAccount, useDAppKit, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { ConnectButton } from "@mysten/dapp-kit-react";
import { Loader2, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { VARUNA_CALL_OPTIONS_PACKAGE_ID, VARUNA_PUT_OPTIONS_PACKAGE_ID } from "../constants";

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
}

// Example option pools - in production, these would be fetched from on-chain
const EXAMPLE_OPTIONS: OptionPool[] = [
    {
        id: "0x77a55a7f355f449db59fa7de7f957c79c211a0a893f7ba01115cf2e9c00db58e",
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
    },
    {
        id: "0x4cec5d3862ce4d9cd868e31d5afe48c16ad7345cf923c4bcd817e7672deb8b4c",
        name: "PUT DEEP/SUI Strike 0.03",
        type: "PUT",
        strikePrice: 0.03,
        expirationDate: 1798761600000, // Jan 1, 2027
        baseAsset: "DEEP",
        quoteAsset: "SUI",
        optionTokenType: "0x1c33e5c040eb0d23fe7a8f42724beaaeaa1c901f8b5f2047ef74d5c84b8b4427::put_deep_sui_30000000_exp20270101::PUT_DEEP_SUI_30000000_EXP20270101",
        baseAssetType: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP", // testnet
        quoteAssetType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI", // testnet
    },
];

export function OptionsPage() {
    const currentAccount = useCurrentAccount();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();
    const [mintingPool, setMintingPool] = useState<string | null>(null);
    const [collateralAmount, setCollateralAmount] = useState<string>("");
    const [poolId, setPoolId] = useState<string>("");

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
                // For PUT: use only ONE coin for collateral so wallet has other coins for gas
                // (setGasPayment can't overlap with inputs - we'd use same coin for both)
                // Pick the coin with largest balance that has enough for collateral
                const coinsWithBalance = coins.data
                    .filter((c) => BigInt(c.balance) >= amountInQuoteUnits)
                    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
                if (coinsWithBalance.length === 0) {
                    toast.error("No single coin has enough balance", {
                        description: `You need ${collateralAmount} SUI in one coin. Try consolidating your SUI first.`,
                    });
                    setMintingPool(null);
                    return;
                }
                remainderCoinId = coinsWithBalance[0].coinObjectId;
                // For PUT: collateral is QuoteAsset, calculate amount from collateral
                amountToMint = (amountInQuoteUnits * PRICE_DECIMALS) / strikePriceInBaseUnits;
                const [splitCoin] = tx.splitCoins(tx.object(remainderCoinId), [Number(amountInQuoteUnits)]);
                collateralCoin = splitCoin;
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
                target: option.type === "CALL" ? `${packageId}::options_pool::mint_call_options` : `${packageId}::options_pool::mint_put_options`,
                typeArguments: [
                    option.optionTokenType,
                    option.baseAssetType,
                    option.quoteAssetType,
                ],
                arguments: optionArguments as any,
            });

            // Transfer objects to the user: option coins, owner token, and remainder
            tx.transferObjects(
                [optionCoins, ownerToken, tx.object(remainderCoinId)],
                currentAccount.address
            );
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
                        <h2 className="text-3xl font-bold">Options Trading</h2>
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

