import { useState } from "react";
import { ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
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
        <div className="flex flex-col h-full bg-card/95 text-[11px] sm:text-[12px] overflow-hidden">
            {/* Header: on mobile, pool + expiry only; on desktop, Calls | Pool + Expiration | Puts */}
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3 shrink-0">
                {/* Calls label — hidden on mobile (duplicated in section headers) */}
                <div className="hidden lg:flex items-center gap-2">
                    <span className="font-semibold text-buy">Calls</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="flex-1 flex flex-col sm:flex-row gap-3 min-w-0 lg:flex-initial lg:flex-wrap justify-center">
                    {pools.length > 0 && (
                        <div className="relative min-w-0">
                            <select
                                value={effectivePool ?? ""}
                                onChange={(e) => {
                                    setActivePool(e.target.value || null);
                                    setActiveExpiration(null);
                                    onSelectOption(null);
                                }}
                                className="w-full sm:flex-1 sm:min-w-0 min-h-[48px] bg-input border rounded-lg px-4 py-3 pr-10 text-base sm:text-sm font-medium focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
                            >
                                {pools.map(([key, opt]) => (
                                    <option key={key} value={key}>
                                        {opt.baseAsset}/{opt.quoteAsset} ({opt.deepbookPoolName})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                        </div>
                    )}
                    <div className="relative min-w-0">
                        <select
                            value={effectiveExpiration ?? ""}
                            onChange={(e) => setActiveExpiration(Number(e.target.value) || null)}
                            className="w-full sm:flex-1 sm:min-w-0 min-h-[48px] bg-input border rounded-lg px-4 py-3 pr-10 text-base sm:text-sm font-medium focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
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
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                    </div>
                </div>

                {/* Puts label — hidden on mobile (duplicated in section headers) */}
                <div className="hidden lg:flex items-center gap-2">
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sell">Puts</span>
                </div>
            </div>

            {/* Options chain table */}
            {strikes.length > 0 ? (
                <div className="flex-1 overflow-auto min-h-0">
                    {/* Mobile: vertical split — Calls above, Puts below */}
                    <div className="lg:hidden space-y-4 p-2">
                        <div>
                            <div className="text-buy font-semibold text-xs px-2 py-1.5 border-b">
                                Calls
                            </div>
                            <table className="w-full border-collapse [&_td]:border-0 [&_th]:border-0">
                                <thead>
                                    <tr>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Strike</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Bid</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Ask</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Last</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {strikes.map((strike) => {
                                        const call = getCallForStrike(strike);
                                        const isRowSelected = call && selectedOption?.id === call.id;
                                        return (
                                            <tr
                                                key={`call-${strike}`}
                                                onClick={() => call && onSelectOption(call)}
                                                className={cn(
                                                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                                                    call && "cursor-pointer",
                                                    isRowSelected && "bg-buy/15"
                                                )}
                                            >
                                                <td className="py-2 px-2 font-medium">{formatStrike(strike)}</td>
                                                <CallPutCells
                                                    option={call}
                                                    isCall
                                                    selectedOption={selectedOption}
                                                    onSelect={onSelectOption}
                                                    userBalance={call ? userTokenBalances[call.id] : undefined}
                                                    isExpired={call ? isExpired(call.expirationDate) : false}
                                                    mobile
                                                    selectionOnRow
                                                />
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <div className="text-sell font-semibold text-xs px-2 py-1.5 border-b">
                                Puts
                            </div>
                            <table className="w-full border-collapse [&_td]:border-0 [&_th]:border-0">
                                <thead>
                                    <tr>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Strike</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Bid</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Ask</th>
                                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Last</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {strikes.map((strike) => {
                                        const put = getPutForStrike(strike);
                                        const isRowSelected = put && selectedOption?.id === put.id;
                                        return (
                                            <tr
                                                key={`put-${strike}`}
                                                onClick={() => put && onSelectOption(put)}
                                                className={cn(
                                                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                                                    put && "cursor-pointer",
                                                    isRowSelected && "bg-buy/15"
                                                )}
                                            >
                                                <td className="py-2 px-2 font-medium">{formatStrike(strike)}</td>
                                                <CallPutCells
                                                    option={put}
                                                    isCall={false}
                                                    selectedOption={selectedOption}
                                                    onSelect={onSelectOption}
                                                    userBalance={put ? userTokenBalances[put.id] : undefined}
                                                    isExpired={put ? isExpired(put.expirationDate) : false}
                                                    mobile
                                                    selectionOnRow
                                                />
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Desktop: horizontal layout */}
                    <table className="hidden lg:table w-full border-collapse">
                        <thead className="sticky top-0 bg-card z-10 border-b">
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
                                        <CallPutCells
                                            option={call}
                                            isCall
                                            selectedOption={selectedOption}
                                            onSelect={onSelectOption}
                                            userBalance={call ? userTokenBalances[call.id] : undefined}
                                            isExpired={call ? isExpired(call.expirationDate) : false}
                                        />
                                        <td className="py-2 px-3 text-center font-semibold bg-muted/20">
                                            {formatStrike(strike)}
                                        </td>
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
    mobile = false,
    selectionOnRow = false,
}: {
    option: OptionPool | undefined;
    isCall: boolean;
    selectedOption: OptionPool | null;
    onSelect: (o: OptionPool) => void;
    userBalance?: string;
    isExpired: boolean;
    mobile?: boolean;
    selectionOnRow?: boolean;
}) {
    const isSelected = option && selectedOption?.id === option.id;
    const cellClass = cn(
        "py-2 px-2 transition-colors",
        !selectionOnRow && "cursor-pointer",
        !selectionOnRow && isSelected && "bg-buy/15 ring-1 ring-primary/50",
        selectionOnRow && "cursor-pointer",
        isExpired && option && "text-sell"
    );
    const alignClass = isCall ? "text-left" : "text-right";
    const colCount = mobile ? 3 : 5;

    if (!option) {
        return (
            <>
                {Array.from({ length: colCount }).map((_, i) => (
                    <td key={i} className={cn("py-2 px-2 text-muted-foreground/50", alignClass)}>
                        {PLACEHOLDER}
                    </td>
                ))}
            </>
        );
    }

    const handleClick = selectionOnRow ? undefined : () => onSelect(option);

    if (mobile) {
        return (
            <>
                <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
                <td onClick={handleClick} className={cn(cellClass, alignClass)}>{PLACEHOLDER}</td>
                <td onClick={handleClick} className={cn(cellClass, alignClass)}>{userBalance ?? PLACEHOLDER}</td>
            </>
        );
    }

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
