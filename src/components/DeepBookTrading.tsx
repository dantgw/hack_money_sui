import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TradingChart, CandlestickData } from './TradingChart';
import {
  getAllPools,
  getMarketPrice,
  getOHLCVData,
  PoolInfo,
  MarketPrice,
} from '../lib/deepbook';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { network } from '../constants';

export function DeepBookTrading() {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [marketPrice, setMarketPrice] = useState<MarketPrice | null>(null);
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pools on mount
  useEffect(() => {
    const loadPools = async () => {
      try {
        setLoading(true);
        const availablePools = await getAllPools(network);
        console.log('Loaded pools:', availablePools);
        setPools(availablePools);

        // Set the first pool as selected by default
        if (availablePools.length > 0) {
          // Prefer SUI_USDC if available, otherwise use first pool
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

  // Load pool data when selected pool changes
  useEffect(() => {
    if (!selectedPool) return;

    const loadPoolData = async () => {
      try {
        setRefreshing(true);
        setError(null);

        console.log('Loading data for pool:', selectedPool);

        // Get REAL market price from DeepBook Indexer
        const price = await getMarketPrice(selectedPool, network);

        if (!price) {
          setError('Unable to fetch price data. Pool may not have recent trades.');
          setMarketPrice(null);
          setChartData([]);
        } else {
          setMarketPrice(price);

          // Fetch REAL historical OHLCV data from DeepBook Indexer
          // Get 1-hour candles for the last ~4 days (100 candles)
          const ohlcvData = await getOHLCVData(selectedPool, '1h', 100, network);

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
      } finally {
        setRefreshing(false);
      }
    };

    loadPoolData();
  }, [selectedPool, network]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading DeepBook data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedPoolInfo = pools.find((p) => p.poolName === selectedPool);

  return (
    <div className="space-y-4">
      {/* Pool Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            DeepBook Trading Pools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {pools.map((pool) => (
              <button
                key={pool.poolName}
                onClick={() => setSelectedPool(pool.poolName)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedPool === pool.poolName
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
              >
                {pool.baseCoin}/{pool.quoteCoin}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="bg-red-950/20 border-red-900/50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-200">
              <strong>Error:</strong> {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Price Info */}
      {marketPrice && selectedPoolInfo && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedPoolInfo.baseCoin}/{selectedPoolInfo.quoteCoin}
              </CardTitle>
              <button
                onClick={() => {
                  if (selectedPool) {
                    // Trigger reload by updating the pool (forces useEffect)
                    const current = selectedPool;
                    setSelectedPool(null);
                    setTimeout(() => setSelectedPool(current), 0);
                  }
                }}
                disabled={refreshing}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                title="Refresh data"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Best Bid</p>
                <p className="text-lg font-bold text-green-500">
                  ${marketPrice.bestBidPrice.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mid Price</p>
                <p className="text-lg font-bold">
                  ${marketPrice.midPrice.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Best Ask</p>
                <p className="text-lg font-bold text-red-500">
                  ${marketPrice.bestAskPrice.toFixed(4)}
                </p>
              </div>
            </div>

            {chartData.length > 0 && (
              <TradingChart
                data={chartData}
                symbol={`${selectedPoolInfo.baseCoin}/${selectedPoolInfo.quoteCoin}`}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      <Card className="bg-blue-950/20 border-blue-900/50">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-200">
            <strong>Live Data:</strong> All data is fetched in real-time from the{' '}
            <a
              href="https://docs.sui.io/standards/deepbookv3-indexer"
              className="underline hover:text-blue-100"
              target="_blank"
              rel="noopener noreferrer"
            >
              DeepBook V3 Indexer
            </a>
            {' '}on Sui {network}. Prices and OHLCV candlestick data are actual trading data from the blockchain.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
