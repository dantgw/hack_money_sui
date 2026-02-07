import { MarketPrice, PoolInfo } from '../lib/deepbook';

import { ChevronDown, ChevronUp } from 'lucide-react';

interface TradingHeaderProps {
    poolInfo: PoolInfo;
    marketPrice: MarketPrice | null;
    network: string;
    onOpenSelector: () => void;
    isSelectorOpen: boolean;
}

export function TradingHeader({ poolInfo, marketPrice, network, onOpenSelector, isSelectorOpen }: TradingHeaderProps) {
    return (
        <div className="flex items-center justify-between p-2 sm:p-2 bg-background border-b text-[11px] sm:text-[12px]">
            <div className="flex items-center space-x-3 sm:space-x-6 pl-1 sm:pl-2 min-w-0 flex-1">
                <div className="flex items-center space-x-1 group cursor-pointer min-h-[44px] touch-manipulation py-1" onClick={onOpenSelector}>
                    <div className="flex items-center space-x-2 mr-1">
                        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-[10px]">
                            {poolInfo.baseCoin[0]}
                        </div>
                        <div className="font-bold text-base transition-colors group-hover:text-primary">
                            {poolInfo.baseCoin}-{poolInfo.quoteCoin}
                        </div>
                    </div>
                    <div className="flex flex-col text-muted-foreground group-hover:text-primary transition-colors">
                        {isSelectorOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </div>
                </div>

                <div className="flex flex-col border-l pl-4">
                    <span className="text-muted-foreground text-[9px] uppercase font-bold tracking-tighter">Mark Price</span>
                    <span className={`font-bold ${marketPrice ? 'text-green-400' : ''}`}>
                        {marketPrice ? marketPrice.midPrice.toFixed(4) : '---'}
                    </span >
                </div>

                <div className="hidden md:flex flex-col border-l pl-4">
                    <span className="text-muted-foreground text-[9px] uppercase font-bold tracking-tighter">24h Change</span>
                    <span className="font-medium text-green-400">+2.45%</span>
                </div>

                <div className="hidden lg:flex flex-col border-l pl-4">
                    <span className="text-muted-foreground text-[9px] uppercase font-bold tracking-tighter">24h Volume</span>
                    <span className="font-medium text-foreground">$1,245,678</span>
                </div>

                <div className="hidden xl:flex flex-col border-l pl-4">
                    <span className="text-muted-foreground text-[9px] uppercase font-bold tracking-tighter">Network</span>
                    <span className="font-medium text-primary capitalize">{network}</span>
                </div>
            </div>


        </div>
    );
}
