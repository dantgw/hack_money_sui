import { useState, useEffect } from 'react';
import { getOrderBook, OrderBookData, OrderBookLevel } from '../lib/deepbook';

interface OrderBookProps {
  poolName: string;
  network: 'mainnet' | 'testnet';
}

export function OrderBook({ poolName, network }: OrderBookProps) {
  const [data, setData] = useState<OrderBookData | null>(null);

  useEffect(() => {
    const fetchBook = async () => {
      const book = await getOrderBook(poolName, network);
      setData(book);
    };

    fetchBook();
    const interval = setInterval(fetchBook, 5000);
    return () => clearInterval(interval);
  }, [poolName, network]);

  if (!data) return <div className="p-4 text-muted-foreground">Loading Order Book...</div>;

  const maxTotal = Math.max(
    ...data.asks.map(a => a.price * a.quantity),
    ...data.bids.map(b => b.price * b.quantity)
  );

  return (
    <div className="flex flex-col h-full bg-background border-l text-[12px]">
      <div className="p-2 font-semibold border-b">Order Book</div>
      <div className="grid grid-cols-3 p-2 text-muted-foreground border-b uppercase tracking-wider">
        <div>Price</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Asks (Sells) - Red */}
        <div className="flex flex-col-reverse">
          {data.asks.map((ask, i) => (
            <div key={`ask-${i}`} className="grid grid-cols-3 p-1 hover:bg-red-500/10 relative">
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
          Spread: {Math.abs(data.asks[0].price - data.bids[0].price).toFixed(5)}
        </div>

        {/* Bids (Buys) - Green */}
        <div>
          {data.bids.map((bid, i) => (
            <div key={`bid-${i}`} className="grid grid-cols-3 p-1 hover:bg-green-500/10 relative">
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
    </div>
  );
}
