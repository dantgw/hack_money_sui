import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { getOrders, cancelOrder, getBalanceManager, getAllPools, PoolInfo, Order } from '../lib/deepbook';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';

interface AccountPanelProps {
    poolName: string;
}

export function AccountPanel({ poolName }: AccountPanelProps) {
    const [activeTab, setActiveTab] = useState<'orders' | 'orderHistory'>('orders');
    const currentAccount = useCurrentAccount();
    const client = useCurrentClient();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();

    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [balanceManager, setBalanceManager] = useState<string | null>(null);
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

    // Open orders are those that are still placed (not filled/cancelled)
    const openOrders = orders.filter((order) => order.status === 'placed');

    const tabs = [
        { id: 'orders', label: `Open Orders${openOrders.length > 0 ? ` (${openOrders.length})` : ''}` },
        { id: 'orderHistory', label: 'Order History' },
    ] as const;

    // Fetch pool info and balance manager
    useEffect(() => {
        const fetchData = async () => {
            if (!currentAccount?.address) {
                setBalanceManager(null);
                return;
            }

            try {
                const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
                const pools = await getAllPools(network);
                const pool = pools.find(p => p.poolName === poolName);
                setPoolInfo(pool || null);

                const bm = await getBalanceManager(client, currentAccount.address, network);
                setBalanceManager(bm);
            } catch (error) {
                console.error('Error fetching pool info or balance manager:', error);
            }
        };

        fetchData();
    }, [currentAccount?.address, poolName, client, currentNetwork]);

    // Shared fetchOrders function so we can reuse it after actions like cancel
    const fetchOrders = useCallback(async () => {
        if (!balanceManager || !poolName) return;

        setIsLoadingOrders(true);
        try {
            const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
            const fetchedOrders = await getOrders(poolName, balanceManager, network);
            setOrders(fetchedOrders);
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error('Failed to fetch orders', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsLoadingOrders(false);
        }
    }, [balanceManager, poolName, currentNetwork]);

    // Fetch orders when balance manager / pool become available
    useEffect(() => {
        if (balanceManager && poolName) {
            fetchOrders();
        }
    }, [balanceManager, poolName, fetchOrders]);

    // Handle order cancellation
    const handleCancelOrder = async (order: Order) => {
        if (!currentAccount?.address || !poolInfo || !balanceManager) {
            toast.error('Missing required information', {
                description: 'Please ensure you are connected and have a balance manager',
            });
            return;
        }

        setCancelingOrderId(order.order_id);
        try {
            const tx = new Transaction();
            tx.setSender(currentAccount.address);
            const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';

            cancelOrder(tx, client, currentAccount.address, poolInfo, balanceManager, order.order_id, network);

            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === 'FailedTransaction') {
                throw new Error('Transaction failed');
            }

            toast.success('Order canceled', {
                description: `Order ${order.order_id.slice(0, 8)}... has been canceled`,
            });

            // Refresh orders
            await fetchOrders();
        } catch (error) {
            console.error('Error canceling order:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Failed to cancel order', {
                description: errorMessage,
            });
        } finally {
            setCancelingOrderId(null);
        }
    };

    // Format timestamp
    const formatTime = (timestamp: number) => {
        // Ensure timestamp is in milliseconds
        const ts = timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
        const date = new Date(ts);
        return date.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    // Format order value
    const formatOrderValue = (price: number, size: number, quoteSymbol: string) => {
        return `${(price * size).toFixed(2)} ${quoteSymbol}`;
    };

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex border-b border-border shrink-0 font-display">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2.5 px-2 sm:p-2 text-xs font-bold uppercase transition-colors border-b-2 -mb-[2px] min-h-[44px] touch-manipulation rounded-t-lg ${activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground active:bg-muted/50'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto p-2 sm:p-2">
                {activeTab === 'orders' && (
                    <div className="w-full">
                        {isLoadingOrders ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : openOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-2">
                                <p className="text-sm">No open orders</p>
                                <p className="text-xs italic">Place an order to see it here</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px] sm:text-xs min-w-[640px]">
                                    <thead className="text-muted-foreground border-b uppercase tracking-tight">
                                        <tr>
                                            <th className="p-2 sm:p-1">Time</th>
                                            <th className="p-2 sm:p-1">Type</th>
                                            <th className="p-2 sm:p-1">Coin</th>
                                            <th className="p-2 sm:p-1">Direction</th>
                                            <th className="p-2 sm:p-1 text-right">Remaining Qty</th>
                                            <th className="p-2 sm:p-1 text-right">Original Qty</th>
                                            <th className="p-2 sm:p-1 text-right">Order Value</th>
                                            <th className="p-2 sm:p-1 text-right">Price</th>
                                            <th className="p-2 sm:p-1 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {openOrders.map((order) => {
                                            const sideColor = order.side === 'buy' ? 'text-buy' : 'text-sell';
                                            const isCanceling = cancelingOrderId === order.order_id;
                                            const quoteSymbol = poolInfo?.quoteCoin || 'USDC';
                                            const baseSymbol = poolInfo?.baseCoin || 'SUI';

                                            return (
                                                <tr key={order.order_id} className="hover:bg-muted/50">
                                                    <td className="p-2 sm:p-1">{formatTime(order.timestamp)}</td>
                                                    <td className="p-2 sm:p-1 capitalize">{order.order_type}</td>
                                                    <td className={`p-2 sm:p-1 ${sideColor}`}>
                                                        {baseSymbol}/{quoteSymbol}
                                                    </td>
                                                    <td className={`p-2 sm:p-1 ${sideColor} capitalize`}>
                                                        {order.side === 'buy' ? 'Buy' : 'Sell'}
                                                    </td>
                                                    <td className="p-2 sm:p-1 text-right">{order.remaining_quantity.toFixed(4)}</td>
                                                    <td className="p-2 sm:p-1 text-right">{order.quantity.toFixed(4)}</td>
                                                    <td className={`p-2 sm:p-1 text-right ${sideColor}`}>
                                                        {formatOrderValue(order.price, order.remaining_quantity, quoteSymbol)}
                                                    </td>
                                                    <td className="p-2 sm:p-1 text-right">{order.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                    <td className="p-2 sm:p-1 text-right">
                                                        <Button
                                                            onClick={() => handleCancelOrder(order)}
                                                            disabled={isCanceling}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-xs cursor-pointer"
                                                        >
                                                            {isCanceling ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                'Cancel'
                                                            )}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'orderHistory' && (
                    <div className="w-full">
                        {isLoadingOrders ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-2">
                                <p className="text-sm">No order history</p>
                                <p className="text-xs italic">Your past orders will appear here</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px] sm:text-xs min-w-[480px]">
                                    <thead className="text-muted-foreground border-b uppercase tracking-tight">
                                        <tr>
                                            <th className="p-2 sm:p-1">Time</th>
                                            <th className="p-2 sm:p-1">Coin</th>
                                            <th className="p-2 sm:p-1">Side</th>
                                            <th className="p-2 sm:p-1 text-right">Filled / Total</th>
                                            <th className="p-2 sm:p-1 text-right">Price</th>
                                            <th className="p-2 sm:p-1 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {orders.map((order) => {
                                            const sideColor = order.side === 'buy' ? 'text-buy' : 'text-sell';
                                            const quoteSymbol = poolInfo?.quoteCoin || 'USDC';
                                            const baseSymbol = poolInfo?.baseCoin || 'SUI';

                                            return (
                                                <tr key={order.order_id} className="hover:bg-muted/50">
                                                    <td className="p-2 sm:p-1">{formatTime(order.timestamp)}</td>
                                                    <td className={`p-2 sm:p-1 ${sideColor}`}>
                                                        {baseSymbol}/{quoteSymbol}
                                                    </td>
                                                    <td className={`p-2 sm:p-1 ${sideColor} capitalize`}>
                                                        {order.side === 'buy' ? 'Buy' : 'Sell'}
                                                    </td>
                                                    <td className="p-2 sm:p-1 text-right">
                                                        {order.filled_quantity.toFixed(4)} / {order.quantity.toFixed(4)}
                                                    </td>
                                                    <td className="p-2 sm:p-1 text-right">
                                                        {order.price.toLocaleString('en-US', {
                                                            minimumFractionDigits: 1,
                                                            maximumFractionDigits: 1,
                                                        })}
                                                    </td>
                                                    <td className="p-2 sm:p-1 text-right capitalize">
                                                        {order.status}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
