import { useState, useEffect } from 'react';
import { getOrderBook, OrderBookData, getRecentTrades, Trade } from '../lib/deepbook';

interface OrderBookProps {
    poolName: string;
    network: 'mainnet' | 'testnet' | 'devnet';
    onSelectPrice?: (price: number) => void;
}

type TabType = 'orderbook' | 'trades';

export function OrderBook({ poolName, network, onSelectPrice }: OrderBookProps) {
    const [activeTab, setActiveTab] = useState<TabType>('orderbook');
    const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
    const [trades, setTrades] = useState<Trade[]>([]);

    useEffect(() => {
        // Fetch order book and trades together to ensure they're synchronized
        const fetchBookAndTrades = async () => {
            try {
                // Fetch both simultaneously using Promise.all to ensure they're in sync
                const [book, recentTrades] = await Promise.all([
                    getOrderBook(poolName, network),
                    getRecentTrades(poolName, network)
                ]);

                setOrderBookData(book);
                setTrades(recentTrades);
            } catch (error) {
                console.error('Error fetching order book and trades:', error);
            }
        };

        fetchBookAndTrades();

        const interval = setInterval(fetchBookAndTrades, 5000);

        return () => clearInterval(interval);
    }, [poolName, network]);

    const maxTotal = orderBookData ? Math.max(
        ...orderBookData.asks.map(a => a.price * a.quantity),
        ...orderBookData.bids.map(b => b.price * b.quantity)
    ) : 0;

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    return (
        <div className="flex flex-col h-full bg-background border-l text-[12px]">
            {/* Tab Header */}
            <div className="flex border-b">
                <button
                    onClick={() => setActiveTab('orderbook')}
                    className={`flex-1 p-2 font-semibold transition-colors ${activeTab === 'orderbook'
                        ? 'bg-primary/10 text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                >
                    Order Book
                </button>
                <button
                    onClick={() => setActiveTab('trades')}
                    className={`flex-1 p-2 font-semibold transition-colors ${activeTab === 'trades'
                        ? 'bg-primary/10 text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                >
                    Trades
                </button>
            </div>

            {/* Order Book View */}
            {activeTab === 'orderbook' && (
                <>
                    <div className="grid grid-cols-3 p-2 text-muted-foreground border-b uppercase tracking-wider">
                        <div>Price</div>
                        <div className="text-right">Size</div>
                        <div className="text-right">Total</div>
                    </div>

                    {!orderBookData ? (
                        <div className="p-4 text-muted-foreground">Loading Order Book...</div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            {/* Asks (Sells) - Red */}
                            <div className="flex flex-col-reverse">
                                {orderBookData.asks.map((ask, i) => (
                                    <div
                                        key={`ask-${i}`}
                                        className="grid grid-cols-3 p-1 hover:bg-red-500/10 relative cursor-pointer"
                                        onClick={() => onSelectPrice?.(ask.price)}
                                    >
                                        <div
                                            className="absolute inset-y-0 right-0 bg-red-500/5 transition-all"
                                            style={{ width: `${(ask.price * ask.quantity / maxTotal) * 100}%` }}
                                        />
                                        <div className="text-red-500 z-10">{ask.price.toFixed(4)}</div>
                                        <div className="text-right z-10">{ask.quantity.toFixed(2)}</div>
                                        <div className="text-right z-10">{(ask.price * ask.quantity).toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Spread */}
                            <div className="p-2 border-y bg-muted/30 text-center font-medium">
                                Spread: {Math.abs(orderBookData?.asks?.[0]?.price - orderBookData?.bids?.[0]?.price).toFixed(5)}
                            </div>

                            {/* Bids (Buys) - Green */}
                            <div>
                                {orderBookData.bids.map((bid, i) => (
                                    <div
                                        key={`bid-${i}`}
                                        className="grid grid-cols-3 p-1 hover:bg-green-500/10 relative cursor-pointer"
                                        onClick={() => onSelectPrice?.(bid.price)}
                                    >
                                        <div
                                            className="absolute inset-y-0 right-0 bg-green-500/5 transition-all"
                                            style={{ width: `${(bid.price * bid.quantity / maxTotal) * 100}%` }}
                                        />
                                        <div className="text-green-500 z-10">{bid.price.toFixed(4)}</div>
                                        <div className="text-right z-10">{bid.quantity.toFixed(2)}</div>
                                        <div className="text-right z-10">{(bid.price * bid.quantity).toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Trades View */}
            {activeTab === 'trades' && (
                <>
                    <div className="grid grid-cols-3 p-2 text-muted-foreground border-b uppercase tracking-wider">
                        <div>Price</div>
                        <div className="text-right">Size</div>
                        <div className="text-right">Time</div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {trades.length === 0 ? (
                            <div className="p-4 text-muted-foreground">Loading trades...</div>
                        ) : (
                            trades.map((trade) => (
                                <div
                                    key={trade.id}
                                    className={`grid grid-cols-3 p-1 ${trade.side === 'buy'
                                        ? 'hover:bg-green-500/10'
                                        : 'hover:bg-red-500/10'
                                        }`}
                                >
                                    <div className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                                        {trade.price.toFixed(4)}
                                    </div>
                                    <div className="text-right">{trade.size.toFixed(2)}</div>
                                    <div className="text-right text-muted-foreground">
                                        {formatTime(trade.time)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
