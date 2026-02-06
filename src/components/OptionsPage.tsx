import { useState } from "react";
import { useCurrentAccount, useDAppKit, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { ConnectButton } from "@mysten/dapp-kit-react";
import { Loader2, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { VARUNA_OPTIONS_PACKAGE_ID } from "../constants";

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
        const packageId = VARUNA_OPTIONS_PACKAGE_ID[network];

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
                coinType: option.baseAssetType,
            });

            if (coins.data.length === 0) {
                toast.error("Insufficient balance", {
                    description: `You don't have any ${option.baseAsset} coins. Please acquire some first.`,
                });
                setMintingPool(null);
                return;
            }

            const tx = new Transaction();
            tx.setSender(currentAccount.address);

            // Get all coin object IDs
            const coinObjectIds = coins.data.map((coin) => coin.coinObjectId);

            // Merge coins if there are multiple
            if (coinObjectIds.length > 1) {
                tx.mergeCoins(
                    tx.object(coinObjectIds[0]),
                    coinObjectIds.slice(1).map((id) => tx.object(id))
                );
            }

            // Convert collateral amount to base units
            const amountInBaseUnits = BigInt(Math.floor(parseFloat(collateralAmount) * Math.pow(10, 6)));

            // Split coins for collateral from the merged coin
            const [collateralCoin] = tx.splitCoins(tx.object(coinObjectIds[0]), [amountInBaseUnits]);

            // Call mint_call_options - returns (option_coins, owner_token)
            const [optionCoins, ownerToken] = tx.moveCall({
                target: `${packageId}::options_pool::mint_call_options`,
                typeArguments: [
                    option.optionTokenType,
                    option.baseAssetType,
                    option.quoteAssetType,
                ],
                arguments: [
                    tx.object(poolIdToUse), // pool: &mut OptionsPool
                    collateralCoin, // collateral: Coin<BaseAsset>
                    tx.object.clock(), // clock: &Clock
                ],
            });

            // Transfer all objects to the user: option coins, owner token, and remainder coin
            tx.transferObjects(
                [optionCoins, ownerToken, tx.object(coinObjectIds[0])],
                currentAccount.address
            );
            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === "FailedTransaction") {
                throw new Error("Transaction failed");
            }

            toast.success("Options minted successfully!", {
                description: `Minted ${collateralAmount} ${option.baseAsset} worth of options`,
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
        <div className="min-h-[calc(100vh-3.5rem)] p-6 bg-background">
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
                                                Collateral ({option.baseAsset})
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

