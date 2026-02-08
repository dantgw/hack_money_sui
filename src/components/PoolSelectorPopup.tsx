import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Star, TrendingUp, TrendingDown } from 'lucide-react';
import { PoolInfo } from '../lib/deepbook';
import { cn } from '../lib/utils';

import deepLogo from '../assets/deep-logo.png';
import suiLogo from '../assets/sui-logo.png';
import usdcLogo from '../assets/usdc-logo.png';
import walrusLogo from '../assets/walrus-logo.webp';

const ASSET_LOGOS: Record<string, string> = {
    DEEP: deepLogo,
    SUI: suiLogo,
    USDC: usdcLogo,
    DBUSDC: usdcLogo,
    DBUSDT: usdcLogo,
    WAL: walrusLogo,
    WALRUS: walrusLogo,
};

interface PoolSelectorPopupProps {
    isOpen: boolean;
    onClose: () => void;
    pools: PoolInfo[];
    onSelect: (poolName: string) => void;
    selectedPoolName: string | null;
}

export function PoolSelectorPopup({ isOpen, onClose, pools, onSelect, selectedPoolName }: PoolSelectorPopupProps) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Handle click outside to close dropdown
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Add event listener with a slight delay to avoid immediate closure
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Handle Escape key to close dropdown
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const filteredPools = useMemo(() => {
        return pools.filter(pool => {
            const matchesSearch = pool.poolName.toLowerCase().includes(search.toLowerCase()) ||
                pool.baseCoin.toLowerCase().includes(search.toLowerCase());
            const matchesCategory = category === 'All' || (category === 'Spot' && pool.poolName.includes('USDC'));
            return matchesSearch && matchesCategory;
        });
    }, [pools, search, category]);

    if (!isOpen) return null;

    return (
        <div
            ref={dropdownRef}
            className="absolute top-full left-0 mt-1 z-50 w-[calc(100vw-16px)] max-w-[700px] sm:w-[700px] bg-card border border-border rounded-xl shadow-clay-lg overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[60vh]"
        >
            {/* Search Header */}
            <div className="p-4 border-b border-border space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        autoFocus
                        placeholder="Search by symbol or asset..."
                        className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 pointer-events-none">
                        <span className="text-[10px] bg-muted/30 px-1.5 py-0.5 rounded border border-border text-muted-foreground">⌘K</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-xs font-bold text-muted-foreground uppercase tracking-tighter">
                    {['All', 'Spot'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={`px-3 py-2 sm:py-1.5 rounded-lg transition-colors min-h-[44px] sm:min-h-0 touch-manipulation ${category === cat ? 'bg-primary/10 text-primary border border-border' : 'hover:text-foreground active:bg-muted/50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Pool Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-[13px]">
                    <thead className="sticky top-0 bg-card text-muted-foreground font-bold border-b border-border uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="pl-4 pr-4 sm:pr-2 py-3 w-8"></th>
                            <th className="py-3">Symbol</th>
                            <th className="py-3 text-right">Price</th>
                            <th className="py-3 text-right">24h Change</th>
                            <th className="hidden sm:table-cell py-3 text-right pr-4">Volume</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {filteredPools.map(pool => {
                            const isSelected = pool.poolName === selectedPoolName;
                            const change = (Math.random() * 10 - 5).toFixed(2); // Simulated for list view
                            const isPositive = parseFloat(change) >= 0;

                            return (
                                <tr
                                    key={pool.poolId}
                                    onClick={() => {
                                        onSelect(pool.poolName);
                                        onClose();
                                    }}
                                    className={`group cursor-pointer transition-colors touch-manipulation min-h-[48px] ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50 active:bg-muted/80'}`}
                                >
                                    <td className="pl-4 pr-4 sm:pr-2 py-3">
                                        <Star className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-accent fill-accent' : 'text-muted-foreground group-hover:text-foreground/60'}`} />
                                    </td>
                                    <td className="py-3 pl-2 sm:pl-0">
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0",
                                                !ASSET_LOGOS[pool.baseCoin] && "bg-orange-500"
                                            )}>
                                                {ASSET_LOGOS[pool.baseCoin] ? (
                                                    <img src={ASSET_LOGOS[pool.baseCoin]} alt={pool.baseCoin} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-white font-bold text-[10px]">{pool.baseCoin[0]}</span>
                                                )}
                                            </div>
                                            <span className="font-bold text-foreground">{pool.baseCoin}-{pool.quoteCoin}</span>
                                            <span className="hidden sm:inline text-[10px] bg-muted/30 px-1 rounded text-muted-foreground">SPOT</span>
                                        </div>
                                    </td>
                                    <td className="py-3 text-right font-medium">
                                        {(Math.random() * 100).toFixed(4)}
                                    </td>
                                    <td className={`py-3 text-right font-medium ${isPositive ? 'text-buy' : 'text-sell'}`}>
                                        <div className="flex items-center justify-end space-x-1">
                                            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            <span>{isPositive ? '+' : ''}{change}%</span>
                                        </div>
                                    </td>
                                    <td className="hidden sm:table-cell py-3 text-right pr-4 text-muted-foreground">
                                        ${(Math.random() * 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredPools.length === 0 && (
                    <div className="py-20 text-center text-muted-foreground italic text-sm">
                        No pools found matching "{search}"
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-2 bg-background border-t border-border flex items-center justify-between text-[10px] text-muted-foreground font-medium uppercase">
                <div className="flex items-center space-x-4 pl-2">
                    <span><span className="text-foreground">↑↓</span> Navigate</span>
                    <span><span className="text-foreground">Enter</span> Select</span>
                </div>
                <button onClick={onClose} className="px-2 py-1 hover:text-foreground">Esc Close</button>
            </div>
        </div>
    );
}
