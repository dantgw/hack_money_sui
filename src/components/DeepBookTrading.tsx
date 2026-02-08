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
import { cn } from '../lib/utils';
import deepLogo from '../assets/deep-logo.png';
import suiLogo from '../assets/sui-logo.png';
import usdcLogo from '../assets/usdc-logo.png';
import walrusLogo from '../assets/walrus-logo.webp';

const ASSET_LOGOS: Record<string, string> = {
  DEEP: deepLogo,
  SUI: suiLogo,
  USDC: usdcLogo,
  WAL: walrusLogo,
  WALRUS: walrusLogo,
};
import { OrderBook } from './OrderBook';
import { OrderPanel } from './OrderPanel';
import { AccountPanel } from './AccountPanel';
import { TradingHeader } from './TradingHeader';
import { PoolSelectorPopup } from './PoolSelectorPopup';
import { BottomSheet } from './ui/bottom-sheet';
import { useCurrentNetwork, useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';

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
  const network = useCurrentNetwork();
  const currentAccount = useCurrentAccount();
  const [selectedPriceFromOrderBook, setSelectedPriceFromOrderBook] = useState<number | null>(null);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const [tradeDrawerSide, setTradeDrawerSide] = useState<'buy' | 'sell'>('buy');
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);

  useEffect(() => {
    const loadPools = async () => {
      try {
        setLoading(true);
        const availablePools = await getAllPools(network);
        setPools(availablePools);

        if (availablePools.length > 0) {
          const preferredPoolName = network === 'mainnet' ? 'SUI_USDC' : 'DEEP_SUI';
          const preferredPool = availablePools.find(p => p.poolName === preferredPoolName);
          setSelectedPool(preferredPool?.poolName || availablePools[0].poolName);
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

  // Clear chart data when network changes so we don't show stale data from the previous network
  useEffect(() => {
    setChartData([]);
    setMarketPrice(null);
    setError(null);
  }, [network]);

  useEffect(() => {
    if (!selectedPool) return;

    const abortController = new AbortController();
    const loadPoolData = async () => {
      const poolForFetch = selectedPool;
      const networkForFetch = network;
      try {
        setError(null);

        // Load OHLCV data for the chart
        const limit = 500;
        const ohlcvData = await getOHLCVData(poolForFetch, interval, limit, undefined, undefined, networkForFetch);

        // Ignore response if effect was cleaned up (network/pool changed)
        if (abortController.signal.aborted) return;

        if (ohlcvData.length > 0) {
          setChartData(ohlcvData);
        } else {
          setError('No historical data available for this pool.');
          setChartData([]);
        }

        // Fetch recent trades to update price
        const recentTrades = await getRecentTrades(poolForFetch, networkForFetch, 1);
        if (abortController.signal.aborted) return;

        if (recentTrades.length > 0) {
          updatePriceFromTrades(recentTrades);
        } else {
          setError('Unable to fetch price data. Pool may not have recent trades.');
          setMarketPrice(null);
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error('Error loading pool data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load pool data');
      }
    };

    loadPoolData();
    const refreshTimer = window.setInterval(loadPoolData, 15000);
    return () => {
      abortController.abort();
      window.clearInterval(refreshTimer);
    };
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
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-widest">Initialising DeepBook...</p>
      </div>
    );
  }

  const selectedPoolInfo = pools.find((p) => p.poolName === selectedPool);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden selection:bg-primary/30 relative">
      {/* Main Layout Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* Left Section: Header, Chart (Top) & Account Panel (Bottom) — Desktop only for Account */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[60px] lg:pb-0">
          {/* Symbol Header */}
          {selectedPoolInfo && (
            <div className="relative shrink-0">
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

          {/* Chart Area — on mobile use most of viewport (header ~4rem, bar+nav ~8rem); on desktop flex to fill */}
          <div className="flex-1 min-h-[calc(100dvh-12rem)] lg:min-h-[300px] relative overflow-hidden">
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
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground italic text-sm px-4">
                {error || 'No chart data available'}
              </div>
            )}
          </div>

          {/* Account Panel — Desktop: orders below chart, scrolls when many orders */}
          <div className="hidden lg:block h-[220px] xl:h-[260px] border-t-2 border-border overflow-hidden bg-card/80 backdrop-blur-sm shrink-0">
            <AccountPanel poolName={selectedPool || ''} refreshTrigger={ordersRefreshTrigger} />
          </div>
        </div>

        {/* Mobile: Buy/Sell bar — Neubrutalism CTAs */}
        <div className="lg:hidden fixed left-0 right-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 flex gap-2 bg-card/95 backdrop-blur border-t border-border">
          <button
            onClick={() => {
              setTradeDrawerSide('buy');
              setTradeDrawerOpen(true);
            }}
            className="flex-1 py-3 rounded-xl font-display font-bold text-base uppercase tracking-wide bg-buy text-buy-foreground border border-border shadow-clay hover:shadow-clay-sm active:shadow-none transition-all touch-manipulation"
          >
            Buy
          </button>
          <button
            onClick={() => {
              setTradeDrawerSide('sell');
              setTradeDrawerOpen(true);
            }}
            className="flex-1 py-3 rounded-xl font-display font-bold text-base uppercase tracking-wide bg-sell text-sell-foreground border border-border shadow-clay hover:shadow-clay-sm active:shadow-none transition-all touch-manipulation"
          >
            Sell
          </button>
        </div>

        {/* Desktop: Order Book (Fixed Width) */}
        <div className="hidden lg:flex w-full lg:w-[320px] xl:w-[400px] shrink-0 flex-col border-l border-r border-border bg-card/90 backdrop-blur-sm overflow-hidden">
          <OrderBook
            poolName={selectedPool || ''}
            network={network}
            onSelectPrice={(price) => setSelectedPriceFromOrderBook(price)}
          />
        </div>

        {/* Desktop: Order Entry Panel (Fixed Width) */}
        <div className="hidden lg:flex w-full lg:w-[320px] xl:w-[400px] shrink-0 flex-col bg-card/90 backdrop-blur-sm overflow-hidden">
          <OrderPanel
            poolInfo={selectedPoolInfo || null}
            currentPrice={marketPrice?.midPrice || 0}
            selectedPriceFromOrderBook={selectedPriceFromOrderBook}
            onOrderPlaced={() => setTimeout(() => setOrdersRefreshTrigger((t) => t + 1), 2000)}
          />
        </div>
      </div>

      {/* Mobile trade drawer — Order Book, Order form, Orders (taller, no expand) */}
      <BottomSheet
        open={tradeDrawerOpen}
        onClose={() => setTradeDrawerOpen(false)}
        title={selectedPoolInfo ? (
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0",
              !ASSET_LOGOS[selectedPoolInfo.baseCoin] && "bg-orange-500"
            )}>
              {ASSET_LOGOS[selectedPoolInfo.baseCoin] ? (
                <img src={ASSET_LOGOS[selectedPoolInfo.baseCoin]} alt={selectedPoolInfo.baseCoin} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-[10px]">{selectedPoolInfo.baseCoin[0]}</span>
              )}
            </div>
            <span className="font-semibold text-lg">{selectedPoolInfo.baseCoin}-{selectedPoolInfo.quoteCoin}</span>
          </div>
        ) : undefined}
        className="max-h-[92vh] min-h-[85vh]"
      >
        <div className="relative flex flex-col min-h-[80vh]">
          <div className={cn(
            "flex flex-col flex-1 min-h-0",
            !currentAccount && "blur-sm pointer-events-none select-none"
          )}>
            <div className="border-b shrink-0 h-[240px] overflow-hidden">
              <OrderBook
                poolName={selectedPool || ''}
                network={network}
                onSelectPrice={(price) => setSelectedPriceFromOrderBook(price)}
              />
            </div>
            <div className="border-b px-4 py-3 shrink-0">
              <OrderPanel
                poolInfo={selectedPoolInfo || null}
                currentPrice={marketPrice?.midPrice || 0}
                selectedPriceFromOrderBook={selectedPriceFromOrderBook}
                initialSide={tradeDrawerSide}
                compact
                onOrderPlaced={() => setTimeout(() => setOrdersRefreshTrigger((t) => t + 1), 2000)}
              />
            </div>
            <div className="flex-1 min-h-[240px] overflow-hidden">
              <AccountPanel poolName={selectedPool || ''} refreshTrigger={ordersRefreshTrigger} />
            </div>
          </div>
          {!currentAccount && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 py-8 bg-card/80 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground text-center">Connect your wallet to start trading</p>
              <div className="[&>button]:!min-h-[48px] [&>button]:!px-8 [&>button]:!text-base [&>button]:!font-semibold">
                <ConnectButton />
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Footer Status Bar — Neubrutalism badge */}
      <div className="hidden sm:flex h-6 sm:h-7 border-t border-border bg-card/80 backdrop-blur-sm items-center px-2 sm:px-3 justify-between text-[10px] text-muted-foreground shrink-0 font-display">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-lg border border-border bg-primary/10 shadow-clay-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
            <span className="truncate font-semibold text-primary">Operational</span>
          </div>
          <div className="hidden sm:block shrink-0">API Latency: 42ms</div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="hidden md:block shrink-0">v3.1.0-deepbook</div>
          <div className="text-primary font-bold shrink-0 truncate max-w-[120px] sm:max-w-none tabular-nums">
            2026 Feb 03 14:04:54
          </div>
        </div>
      </div>
    </div>
  );
}
