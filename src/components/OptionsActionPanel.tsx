import { Button } from "./ui/button";
import { ConnectButton } from "@mysten/dapp-kit-react";
import { Loader2, Calendar, DollarSign, RefreshCw, Zap, Database } from "lucide-react";
import type { OptionPool } from "./OptionsChain";

interface CreatePoolForm {
    baseAssetType: string;
    quoteAssetType: string;
    tickSize: number;
    lotSize: number;
    minSize: number;
}

interface OptionsActionPanelProps {
    selectedOption: OptionPool | null;
    currentAccount: { address: string } | null;
    collateralAmount: string;
    onCollateralChange: (value: string) => void;
    exerciseAmount: string;
    onExerciseAmountChange: (value: string) => void;
    onMint: (option: OptionPool) => void;
    onExercise: (option: OptionPool) => void;
    onUpdatePrice: (option: OptionPool) => void;
    isMinting: boolean;
    isExercising: boolean;
    isUpdatingPrice: boolean;
    hasDeepbookPool: boolean;
    userBalance?: string;
    formatDate: (timestamp: number) => string;
    isExpired: (expirationDate: number) => boolean;
    /** Create Permissionless Pool */
    createPoolForm: CreatePoolForm;
    onCreatePoolFormChange: (updater: (prev: CreatePoolForm) => CreatePoolForm) => void;
    onCreatePool: () => void;
    creatingPool: boolean;
    publishedOptions: OptionPool[];
}

export function OptionsActionPanel({
    selectedOption,
    currentAccount,
    collateralAmount,
    onCollateralChange,
    exerciseAmount,
    onExerciseAmountChange,
    onMint,
    onExercise,
    onUpdatePrice,
    isMinting,
    isExercising,
    isUpdatingPrice,
    hasDeepbookPool,
    userBalance,
    formatDate,
    isExpired,
    createPoolForm,
    onCreatePoolFormChange,
    onCreatePool,
    creatingPool,
    publishedOptions,
}: OptionsActionPanelProps) {
    const expired = selectedOption ? isExpired(selectedOption.expirationDate) : false;

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-background overflow-hidden w-full">
            <div className="flex-1 overflow-auto p-4 space-y-6">
                {/* Option actions (when selected) */}
                {selectedOption ? (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="font-semibold text-base">{selectedOption.name}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedOption.type} • {selectedOption.baseAsset}/{selectedOption.quoteAsset}
                                    </p>
                                </div>
                                <span
                                    className={`px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                                        selectedOption.type === "CALL"
                                            ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                            : "bg-red-500/20 text-red-600 dark:text-red-400"
                                    }`}
                                >
                                    {selectedOption.type}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-1">
                                <span className="text-muted-foreground flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    Strike
                                </span>
                                <span className="font-medium">
                                    {selectedOption.strikePrice} {selectedOption.quoteAsset}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Expiry
                                </span>
                                <span className="font-medium">{formatDate(selectedOption.expirationDate)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Status</span>
                                <span className={`font-medium ${expired ? "text-red-500" : "text-green-500"}`}>
                                    {expired ? "Expired" : "Active"}
                                </span>
                            </div>
                            {currentAccount && userBalance && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                        <Zap className="h-3 w-3" />
                                        Your Balance
                                    </span>
                                    <span className="font-medium">{userBalance}</span>
                                </div>
                            )}
                        </div>

                        {currentAccount ? (
                            <div className="space-y-3 pt-2 border-t">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onUpdatePrice(selectedOption)}
                                    disabled={isUpdatingPrice || expired || !hasDeepbookPool}
                                    className="w-full"
                                >
                                    {isUpdatingPrice ? (
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
                                        Collateral (
                                        {selectedOption.type === "CALL"
                                            ? selectedOption.baseAsset
                                            : selectedOption.quoteAsset}
                                        )
                                    </label>
                                    <input
                                        type="number"
                                        value={collateralAmount}
                                        onChange={(e) => onCollateralChange(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                        disabled={isMinting || expired}
                                    />
                                </div>
                                <Button
                                    onClick={() => onMint(selectedOption)}
                                    disabled={
                                        isMinting ||
                                        expired ||
                                        !collateralAmount ||
                                        parseFloat(collateralAmount) <= 0
                                    }
                                    className="w-full"
                                    loading={isMinting}
                                >
                                    {isMinting ? "Minting..." : "Mint Options"}
                                </Button>

                                <div className="space-y-1.5 pt-2 border-t">
                                    <label className="text-xs text-muted-foreground uppercase font-bold">
                                        Exercise (
                                        {selectedOption.type === "CALL"
                                            ? `Pay ${selectedOption.quoteAsset}, get ${selectedOption.baseAsset}`
                                            : `Sell ${selectedOption.baseAsset}, get ${selectedOption.quoteAsset}`}
                                    )
                                    </label>
                                    <input
                                        type="number"
                                        value={exerciseAmount}
                                        onChange={(e) => onExerciseAmountChange(e.target.value)}
                                        placeholder="Amount to exercise"
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                        disabled={isExercising || expired}
                                    />
                                    <Button
                                        variant="secondary"
                                        onClick={() => onExercise(selectedOption)}
                                        disabled={
                                            isExercising ||
                                            expired ||
                                            !exerciseAmount ||
                                            parseFloat(exerciseAmount) <= 0
                                        }
                                        className="w-full"
                                        loading={isExercising}
                                    >
                                        {isExercising ? "Exercising..." : (
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
                    </div>
                ) : (
                    <div className="text-center py-4">
                        <p className="text-sm font-medium text-muted-foreground">Select an option</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Click a Call or Put in the chain to view details and perform actions.
                        </p>
                    </div>
                )}

                {/* Create Permissionless Pool (only when option selected) */}
                {currentAccount && selectedOption && (
                    <div className="pt-4 border-t space-y-4">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Create DeepBook Pool
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Create a pool for any BaseAsset/QuoteAsset pair. Requires 500 DEEP.
                        </p>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground uppercase font-bold">Base Asset Type</label>
                                <input
                                    type="text"
                                    value={createPoolForm.baseAssetType}
                                    onChange={(e) => onCreatePoolFormChange((p) => ({ ...p, baseAssetType: e.target.value }))}
                                    placeholder="0x...::module::TYPE"
                                    className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                                />
                                {publishedOptions.length > 0 && (
                                    <select
                                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                        onChange={(e) => {
                                            const opt = publishedOptions.find((o) => o.optionTokenType === e.target.value);
                                            if (opt) onCreatePoolFormChange((p) => ({ ...p, baseAssetType: opt.optionTokenType }));
                                        }}
                                    >
                                        <option value="">Or select option token...</option>
                                        {publishedOptions.map((o) => (
                                            <option key={o.id} value={o.optionTokenType}>{o.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground uppercase font-bold">Quote Asset Type</label>
                                <select
                                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={createPoolForm.quoteAssetType}
                                    onChange={(e) => onCreatePoolFormChange((p) => ({ ...p, quoteAssetType: e.target.value }))}
                                >
                                    <option value="0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI">SUI</option>
                                    <option value="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC">USDC (testnet)</option>
                                    <option value="0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC">USDC (mainnet)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Tick</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.tickSize}
                                        onChange={(e) => onCreatePoolFormChange((p) => ({ ...p, tickSize: parseInt(e.target.value) || 1000 }))}
                                        className="w-full px-2 py-1.5 rounded-md border bg-background text-xs focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Lot</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.lotSize}
                                        onChange={(e) => onCreatePoolFormChange((p) => ({ ...p, lotSize: parseInt(e.target.value) || 1000 }))}
                                        className="w-full px-2 py-1.5 rounded-md border bg-background text-xs focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Min</label>
                                    <input
                                        type="number"
                                        value={createPoolForm.minSize}
                                        onChange={(e) => onCreatePoolFormChange((p) => ({ ...p, minSize: parseInt(e.target.value) || 10000 }))}
                                        className="w-full px-2 py-1.5 rounded-md border bg-background text-xs focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={onCreatePool}
                                disabled={creatingPool || !createPoolForm.baseAssetType || !createPoolForm.quoteAssetType}
                                loading={creatingPool}
                                size="sm"
                                className="w-full"
                            >
                                {creatingPool ? "Creating..." : "Create Pool (500 DEEP)"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
