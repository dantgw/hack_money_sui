import { useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "../lib/utils";

export interface OptionPool {
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
    deepbookPoolName: string;
    optionTokenDecimals?: number;
}

interface OptionsChainProps {
    options: OptionPool[];
    selectedOption: OptionPool | null;
    onSelectOption: (option: OptionPool | null) => void;
    userTokenBalances: Record<string, string>;
    formatDate: (timestamp: number) => string;
    isExpired: (expirationDate: number) => boolean;
}

type PoolKey = string;

function getPoolKey(opt: OptionPool): PoolKey {
    return opt.deepbookPoolName;
}

export function OptionsChain({
    options,
    selectedOption,
    onSelectOption,
    userTokenBalances,
    formatDate,
    isExpired,
}: OptionsChainProps) {
    // Unique pools: first option per deepbookPoolName
    const poolMap = new Map<PoolKey, OptionPool>();
    for (const opt of options) {
        const key = getPoolKey(opt);
        if (!poolMap.has(key)) poolMap.set(key, opt);
    }
    const pools = Array.from(poolMap.entries());

    const [activePool, setActivePool] = useState<PoolKey | null>(null);
    const effectivePool = activePool ?? pools[0]?.[0] ?? null;

    const optionsForPool = effectivePool ? options.filter((o) => getPoolKey(o) === effectivePool) : [];

    // Group options by expiration, then by strike
    const byExpiration = new Map<number, OptionPool[]>();
    for (const opt of optionsForPool) {
        const list = byExpiration.get(opt.expirationDate) ?? [];
        list.push(opt);
        byExpiration.set(opt.expirationDate, list);
    }

    const expirations = Array.from(byExpiration.keys()).sort();
    const [activeExpiration, setActiveExpiration] = useState<number | null>(null);
    const effectiveExpiration = activeExpiration ?? expirations[0] ?? null;

    const optionsForExpiration = effectiveExpiration ? byExpiration.get(effectiveExpiration) ?? [] : [];
    const calls = optionsForExpiration.filter((o) => o.type === "CALL");
    const puts = optionsForExpiration.filter((o) => o.type === "PUT");

    // Build strike rows: union of all strikes
    const strikeSet = new Set<number>();
    optionsForExpiration.forEach((o) => strikeSet.add(o.strikePrice));
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);

    const getCallForStrike = (strike: number) => calls.find((c) => c.strikePrice === strike);
    const getPutForStrike = (strike: number) => puts.find((p) => p.strikePrice === strike);

    const formatStrike = (s: number) => s.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

    return (
        <div className="flex flex-col h-full bg-background text-[11px] sm:text-[12px] overflow-hidden">
            {/* Header: Calls | Pool + Expiration | Puts */}
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-600 dark:text-green-400">Calls</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
                    {pools.length > 0 && (
                        <select
                            value={effectivePool ?? ""}
                            onChange={(e) => {
                                setActivePool(e.target.value || null);
                                setActiveExpiration(null);
                                onSelectOption(null);
                            }}
                            className="bg-background border rounded px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none"
                        >
                            {pools.map(([key, opt]) => (
                                <option key={key} value={key}>
                                    {opt.baseAsset}/{opt.quoteAsset} ({opt.deepbookPoolName})
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        value={effectiveExpiration ?? ""}
                        onChange={(e) => setActiveExpiration(Number(e.target.value) || null)}
                        className="bg-background border rounded px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none"
                    >
                        {expirations.map((exp) => {
                            const days = Math.ceil((exp - Date.now()) / 86400000);
                            return (
                                <option key={exp} value={exp}>
                                    {formatDate(exp)} ({days > 0 ? `${days} days` : "0 days"})
                                </option>
                            );
                        })}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-red-600 dark:text-red-400">Puts</span>
                </div>
            </div>

            {/* Options chain table */}
            {strikes.length > 0 ? (
                <div className="flex-1 overflow-auto min-h-0">
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-background z-10 border-b">
                            <tr>
                                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Bid</th>
                                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Ask</th>
                                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Last</th>
                                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Change</th>
                                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Close</th>
                                <th className="py-2 px-3 font-semibold bg-muted/30 text-center">Strike</th>
                                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bid</th>
                                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Ask</th>
                                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Last</th>
                                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Change</th>
                                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Close</th>
                            </tr>
                        </thead>
                        <tbody>
                            {strikes.map((strike) => {
                                const call = getCallForStrike(strike);
                                const put = getPutForStrike(strike);

                                return (
                                    <tr
                                        key={strike}
                                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                    >
                                        {/* Call columns */}
                                        <CallPutCells
                                            option={call}
                                            isCall
                                            selectedOption={selectedOption}
                                            onSelect={onSelectOption}
                                            userBalance={call ? userTokenBalances[call.id] : undefined}
                                            isExpired={call ? isExpired(call.expirationDate) : false}
                                        />
                                        {/* Strike (center) */}
                                        <td className="py-2 px-3 text-center font-semibold bg-muted/20">
                                            {formatStrike(strike)}
                                        </td>
                                        {/* Put columns */}
                                        <CallPutCells
                                            option={put}
                                            isCall={false}
                                            selectedOption={selectedOption}
                                            onSelect={onSelectOption}
                                            userBalance={put ? userTokenBalances[put.id] : undefined}
                                            isExpired={put ? isExpired(put.expirationDate) : false}
                                        />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8">
                    No options for this expiration
                </div>
            )}
        </div>
    );
}

// Placeholder values when we don't have order book data
const PLACEHOLDER = "—";

function CallPutCells({
    option,
    isCall,
    selectedOption,
    onSelect,
    userBalance,
    isExpired,
}: {
    option: OptionPool | undefined;
    isCall: boolean;
    selectedOption: OptionPool | null;
    onSelect: (o: OptionPool) => void;
    userBalance?: string;
    isExpired: boolean;
}) {
    const isSelected = option && selectedOption?.id === option.id;
    const cellClass = cn(
        "py-2 px-2 cursor-pointer transition-colors",
        isSelected && "bg-primary/15 ring-1 ring-primary/50",
        isExpired && option && "text-red-500"
    );
    const alignClass = isCall ? "text-left" : "text-right";

    if (!option) {
        return (
            <>
                {Array.from({ length: 5 }).map((_, i) => (
                    <td key={i} className={cn("py-2 px-2 text-muted-foreground/50", alignClass)}>
                        {PLACEHOLDER}
                    </td>
                ))}
            </>
        );
    }

    const handleClick = () => onSelect(option);

    return (
        <>
            <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
            <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
            <td onClick={handleClick} className={cn(cellClass, alignClass)}>{userBalance ?? PLACEHOLDER}</td>
            <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
            <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
        </>
    );
}
