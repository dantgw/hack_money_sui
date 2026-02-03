import { useState, useEffect } from 'react';
import { TradingChart, CandlestickData, Interval } from './TradingChart';
import {
  getAllPools,
  getMarketPrice,
  getOHLCVData,
  PoolInfo,
  MarketPrice,
} from '../lib/deepbook';
import { RefreshCw } from 'lucide-react';
import { OrderBook } from './OrderBook';
import { OrderPanel } from './OrderPanel';
import { AccountPanel } from './AccountPanel';
import { TradingHeader } from './TradingHeader';
import { PoolSelectorPopup } from './PoolSelectorPopup';

export function DeepBookTrading() {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [marketPrice, setMarketPrice] = useState<MarketPrice | null>(null);
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [interval, setInterval] = useState<Interval>('1h');
  const network = 'mainnet';

  useEffect(() => {
    const loadPools = async () => {
      try {
        setLoading(true);
        const availablePools = await getAllPools(network);
        setPools(availablePools);

        if (availablePools.length > 0) {
          const suiUsdcPool = availablePools.find(p => p.poolName === 'SUI_USDC');
          setSelectedPool(suiUsdcPool?.poolName || availablePools[0].poolName);
        }
      } catch (error) {
        console.error('Error loading pools:', error);
        setError('Failed to load pools');
      } finally {
        setLoading(false);
      }
    };

    loadPools();
  }, [network]);

  useEffect(() => {
    if (!selectedPool) return;

    const loadPoolData = async () => {
      try {
        setError(null);

        const price = await getMarketPrice(selectedPool, network);

        if (!price) {
          setError('Unable to fetch price data. Pool may not have recent trades.');
          setMarketPrice(null);
          setChartData([]);
        } else {
          setMarketPrice(price);
          // Determine limit based on interval
          const limit = interval === '1m' || interval === '5m' ? 200 :
            interval === '15m' || interval === '30m' ? 150 : 100;
          const ohlcvData = await getOHLCVData(selectedPool, interval, limit, network);
          if (ohlcvData.length > 0) {
            setChartData(ohlcvData);
          } else {
            setError('No historical data available for this pool.');
            setChartData([]);
          }
        }
      } catch (error) {
        console.error('Error loading pool data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load pool data');
      }
    };

    loadPoolData();
    const refreshTimer = window.setInterval(loadPoolData, 15000);
    return () => window.clearInterval(refreshTimer);
  }, [selectedPool, network, interval]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Initialising DeepBook...</p>
      </div>
    );
  }

  const selectedPoolInfo = pools.find((p) => p.poolName === selectedPool);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden selection:bg-primary/30 relative">
      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Section: Header, Chart (Top) & Account Panel (Bottom) */}
        <div className="flex-1 flex flex-col min-w-0 border-r overflow-hidden">
          {/* Symbol Header - Now inside the left section */}
          {selectedPoolInfo && (
            <div className="relative">
              <TradingHeader
                poolInfo={selectedPoolInfo}
                marketPrice={marketPrice}
                network={network}
                onOpenSelector={() => setIsSelectorOpen(!isSelectorOpen)}
                isSelectorOpen={isSelectorOpen}
              />
              <PoolSelectorPopup
                isOpen={isSelectorOpen}
                onClose={() => setIsSelectorOpen(false)}
                pools={pools}
                onSelect={(poolName) => {
                  setSelectedPool(poolName);
                  setIsSelectorOpen(false);
                }}
                selectedPoolName={selectedPool}
              />
            </div>
          )}

          {/* Chart Area */}
          <div className="flex-1 relative bg-[#0c0d10] overflow-hidden">
            {chartData.length > 0 && selectedPoolInfo ? (
              <TradingChart
                data={chartData}
                symbol={`${selectedPoolInfo.baseCoin}/${selectedPoolInfo.quoteCoin}`}
                interval={interval}
                onIntervalChange={setInterval}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground italic text-sm">
                {error || 'No chart data available'}
              </div>
            )}


          </div>

          {/* Bottom Panel: Positions & History */}
          <div className="h-[300px] border-t overflow-hidden bg-background">
            <AccountPanel poolName={selectedPool || ''} />
          </div>
        </div>

        {/* Middle Section: Order Book (Fixed Width) */}
        <div className="w-[400px] shrink-0 flex flex-col border-r bg-background overflow-hidden">
          <OrderBook poolName={selectedPool || ''} network={network} />
        </div>

        {/* Right Section: Order Entry Panel (Fixed Width) */}
        <div className="w-[400px] shrink-0 flex flex-col bg-background overflow-hidden">
          <OrderPanel
            poolName={selectedPool || 'SUI_USDC'}
            currentPrice={marketPrice?.midPrice || 0}
          />
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="h-6 border-t bg-background flex items-center px-3 justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Operational</span>
          </div>
          <div>API Latency: 42ms</div>
        </div>
        <div className="flex items-center space-x-4">
          <div>v3.1.0-deepbook</div>
          <div className="text-primary font-bold">2026 Feb 03 14:04:54</div>
        </div>
      </div>
    </div>
  );
}
