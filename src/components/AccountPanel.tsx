import { useState } from 'react';

interface AccountPanelProps {
  poolName: string;
}

export function AccountPanel({ poolName }: AccountPanelProps) {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'trades' | 'orderHistory'>('positions');

  const tabs = [
    { id: 'positions', label: 'Positions' },
    { id: 'orders', label: 'Open Orders' },
    { id: 'trades', label: 'Trade History' },
    { id: 'orderHistory', label: 'Order History' },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-background border-t">
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'positions' && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
            <p className="text-sm">No open positions</p>
            <p className="text-xs italic">Start trading to see your positions here</p>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="w-full">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b uppercase tracking-tight">
                <tr>
                  <th className="pb-2">Pool</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Size</th>
                  <th className="pb-2 text-right">Filled</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Real orders would be mapped here */}
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No open orders
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="w-full">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b uppercase tracking-tight">
                <tr>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Pool</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Size</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No trade history
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'orderHistory' && (
          <div className="w-full">
             <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b uppercase tracking-tight">
                <tr>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Pool</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Size</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No order history
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
