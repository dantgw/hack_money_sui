import { useState } from 'react';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { Button } from './ui/button';

interface OrderPanelProps {
    poolName: string;
    currentPrice: number;
}

export function OrderPanel({ poolName, currentPrice }: OrderPanelProps) {
    const currentAccount = useCurrentAccount();
    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
    const [price, setPrice] = useState(currentPrice.toString());
    const [size, setSize] = useState('');

    const [baseSymbol, quoteSymbol] = poolName.split('_');

    return (
        <div className="flex flex-col h-full bg-background border-l p-4 space-y-4">
            <div className="flex rounded-md bg-muted p-1">
                <button
                    onClick={() => setSide('buy')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${side === 'buy' ? 'bg-green-500 text-white shadow' : 'hover:text-foreground/80'
                        }`}
                >
                    Buy
                </button>
                <button
                    onClick={() => setSide('sell')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${side === 'sell' ? 'bg-red-500 text-white shadow' : 'hover:text-foreground/80'
                        }`}
                >
                    Sell
                </button>
            </div>

            <div className="flex space-x-2 text-xs">
                <button
                    onClick={() => setOrderType('limit')}
                    className={`px-3 py-1 rounded-full border ${orderType === 'limit' ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}
                >
                    Limit
                </button>
                <button
                    onClick={() => setOrderType('market')}
                    className={`px-3 py-1 rounded-full border ${orderType === 'market' ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}
                >
                    Market
                </button>
            </div>

            <div className="space-y-4 pt-2">
                {orderType === 'limit' && (
                    <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground uppercase font-bold">Price ({quoteSymbol})</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="w-full bg-muted/50 border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                placeholder="0.0000"
                            />
                            <button
                                onClick={() => setPrice(currentPrice.toString())}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline"
                            >
                                Market
                            </button>
                        </div>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground uppercase font-bold">Size ({baseSymbol})</label>
                    <input
                        type="number"
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="w-full bg-muted/50 border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                        placeholder="0.00"
                    />
                </div>

                <div className="grid grid-cols-4 gap-1">
                    {['25%', '50%', '75%', '100%'].map((pct) => (
                        <button key={pct} className="text-[10px] py-1 bg-muted rounded hover:bg-muted/80 text-muted-foreground">
                            {pct}
                        </button>
                    ))}
                </div>

                <div className="pt-4 space-y-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Available</span>
                        <span>0.00 {side === 'buy' ? quoteSymbol : baseSymbol}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Order Value</span>
                        <span>{(parseFloat(price || '0') * parseFloat(size || '0')).toFixed(2)} {quoteSymbol}</span>
                    </div>
                </div>

                {currentAccount ? (
                    <Button className={`w-full font-bold uppercase ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                        {side === 'buy' ? 'Long' : 'Short'} {baseSymbol}
                    </Button>
                ) : (
                    <div className="w-full [&>button]:w-full [&>button]:font-bold [&>button]:uppercase">
                        <ConnectButton />
                    </div>
                )}
            </div>
        </div>
    );
}
