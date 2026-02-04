import { useState, useEffect, useCallback } from 'react';
import { TradingChart, CandlestickData, Interval } from './TradingChart';
import {
  getAllPools,
  getOHLCVData,
  getRecentTrades,
  getOrderBook,
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  // Helper function to update market price and chart from recent trades
  const updatePriceFromTrades = useCallback((recentTrades: any[]) => {
    if (recentTrades.length === 0) return;

    const mostRecentTrade = recentTrades[0];
    const tradePrice = mostRecentTrade.price;

    // Update market price from the most recent trade
    const spread = tradePrice * 0.001; // Estimate bid/ask spread (typically 0.1% for liquid pairs)
    const bestBid = tradePrice - spread / 2;
    const bestAsk = tradePrice + spread / 2;

    setMarketPrice({
      bestBidPrice: bestBid,
      bestAskPrice: bestAsk,
      midPrice: tradePrice,
    });

    // Update chart data with the most recent trade price
    setChartData(prevData => {
      if (prevData.length === 0) return prevData;

      // Create a new array and new candle object to ensure React detects the change
      const updatedData = prevData.map((candle, index) => {
        // Only update the last candle (most recent)
        if (index === prevData.length - 1) {
          // Always update the last candle's close price to reflect the most recent trade
          // This ensures the chart shows the live price
          const updatedCandle = { ...candle };
          updatedCandle.close = tradePrice;

          // Update high/low if the trade price exceeds them
          if (tradePrice > candle.high) {
            updatedCandle.high = tradePrice;
          }
          if (tradePrice < candle.low) {
            updatedCandle.low = tradePrice;
          }

          return updatedCandle;
        }
        return candle;
      });

      return updatedData;
    });
  }, []);

  useEffect(() => {
    if (!selectedPool) return;

    const loadPoolData = async () => {
      try {
        setError(null);

        // Load OHLCV data for the chart
        const limit = 500;
        const ohlcvData = await getOHLCVData(selectedPool, interval, limit, undefined, undefined, network);
        // console.log(`[DeepBook] Requested ${limit} ${interval} candles, received ${ohlcvData.length}`);

        if (ohlcvData.length > 0) {
          setChartData(ohlcvData);
        } else {
          setError('No historical data available for this pool.');
          setChartData([]);
        }

        // Fetch recent trades to update price
        const recentTrades = await getRecentTrades(selectedPool, network, 1);
        if (recentTrades.length > 0) {
          updatePriceFromTrades(recentTrades);
        } else {
          setError('Unable to fetch price data. Pool may not have recent trades.');
          setMarketPrice(null);
        }
      } catch (error) {
        console.error('Error loading pool data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load pool data');
      }
    };

    loadPoolData();
    const refreshTimer = window.setInterval(loadPoolData, 15000);
    return () => window.clearInterval(refreshTimer);
  }, [selectedPool, network, interval, updatePriceFromTrades]);

  // Update live price from recent trades (more frequently)
  // Fetch both order book and trades together to ensure they're synchronized
  // This matches what OrderBook component does to keep everything in sync
  useEffect(() => {
    if (!selectedPool) return;

    const updateLivePrice = async () => {
      try {
        // Fetch both trades and order book together using Promise.all()
        // This ensures order book and trades are fetched at the exact same time
        // Even though we don't use the order book here, fetching it ensures synchronization
        const [recentTrades] = await Promise.all([
          getRecentTrades(selectedPool, network, 1),
          getOrderBook(selectedPool, network) // Fetch together for synchronization
        ]);

        updatePriceFromTrades(recentTrades);
      } catch (error) {
        console.error('Error updating live price:', error);
      }
    };

    // Update more frequently for live price (every 5 seconds)
    // This matches the OrderBook refresh interval to keep them synchronized
    updateLivePrice();
    const livePriceTimer = window.setInterval(updateLivePrice, 5000);
    return () => window.clearInterval(livePriceTimer);
  }, [selectedPool, network, updatePriceFromTrades]);

  // Handle loading more historical data when scrolling back
  const handleLoadMore = async (oldestTimestamp: number) => {
    if (!selectedPool || isLoadingMore) return;

    try {
      setIsLoadingMore(true);
      // Always request 200 candles regardless of interval (same as initial load)
      const limit = 200;

      // Calculate how far back to fetch based on interval
      // Fetch enough candles to cover a reasonable time range
      const intervalSeconds = interval === '1m' ? 60 :
        interval === '5m' ? 300 :
          interval === '15m' ? 900 :
            interval === '30m' ? 1800 :
              interval === '1h' ? 3600 :
                interval === '4h' ? 14400 :
                  interval === '1d' ? 86400 : 604800;

      // Convert timestamp to seconds if it's in milliseconds
      // API expects Unix timestamps in seconds
      // Unix timestamps in seconds are typically 10 digits (before year 2286)
      // If timestamp is 13+ digits, it's in milliseconds
      // Check: if timestamp >= 10000000000, it's likely milliseconds (13+ digits)
      const oldestTimestampSeconds = oldestTimestamp >= 10000000000
        ? Math.floor(oldestTimestamp / 1000)
        : oldestTimestamp;

      // Calculate start_time to go back enough to fetch the requested limit
      // end_time should be the oldest timestamp (exclusive, so we get candles before it)
      const endTime = oldestTimestampSeconds;
      const startTime = oldestTimestampSeconds - (limit * intervalSeconds);

      // console.log('Loading more candles:', {
      //   oldestTimestamp,
      //   oldestTimestampSeconds,
      //   startTime,
      //   endTime,
      //   limit,
      //   intervalSeconds,
      //   timeRangeHours: (endTime - startTime) / 3600
      // });

      // Fetch older candles before the given timestamp
      const olderCandles = await getOHLCVData(
        selectedPool,
        interval,
        limit,
        startTime,
        endTime,
        network
      );

      if (olderCandles.length > 0) {
        // console.log('[LoadMore] Successfully loaded', olderCandles.length, 'older candles');

        // Merge with existing data, ensuring no duplicates and maintaining chronological order
        setChartData(prevData => {
          // Create a map of existing timestamps for quick lookup
          const existingTimes = new Set(prevData.map(d => d.time));

          // Filter out duplicates and combine
          const newCandles = olderCandles.filter(c => !existingTimes.has(c.time));
          const combined = [...newCandles, ...prevData];

          // Sort by time to ensure chronological order
          combined.sort((a, b) => a.time - b.time);

          // console.log('[LoadMore] Data merged:', {
          //   previousCount: prevData.length,
          //   newCandlesCount: newCandles.length,
          //   totalCount: combined.length,
          //   newOldestTime: combined[0]?.time,
          //   newOldestDate: combined[0] ? new Date(combined[0].time * 1000).toISOString() : 'N/A'
          // });

          return combined;
        });
      } else {
        console.log('[LoadMore] No older candles returned from API - may have reached the beginning of available data');
      }
    } catch (error) {
      console.error('Error loading more historical data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

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
                onLoadMore={handleLoadMore}
                tickSize={selectedPoolInfo.tickSize}
                quoteAssetDecimals={selectedPoolInfo.quoteAssetDecimals}
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
