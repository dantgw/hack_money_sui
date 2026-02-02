import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TradingChart, CandlestickData } from './TradingChart';
import {
  getAllPools,
  getMarketPrice,
  generateMockPriceHistory,
  PoolInfo,
  MarketPrice,
} from '../lib/deepbook';
import { TrendingUp, RefreshCw } from 'lucide-react';

export function DeepBookTrading() {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<string>('SUI_USDC');
  const [marketPrice, setMarketPrice] = useState<MarketPrice | null>(null);
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPoolData = async () => {
    try {
      setRefreshing(true);
      
      // Get available pools
      const availablePools = await getAllPools();
      setPools(availablePools);

      // Get market price for selected pool
      const price = await getMarketPrice(selectedPool);
      setMarketPrice(price);

      // Generate historical data (in production, fetch from indexer)
      const selectedPoolInfo = availablePools.find((p) => p.poolKey === selectedPool);
      const basePrice = selectedPool === 'DEEP_SUI' ? 0.045 : selectedPool === 'SUI_USDC' ? 2.45 : 0.11;
      const historicalData = generateMockPriceHistory(30, basePrice);
      setChartData(historicalData);
    } catch (error) {
      console.error('Error loading pool data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPoolData();
  }, [selectedPool]);

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

  const selectedPoolInfo = pools.find((p) => p.poolKey === selectedPool);

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
                key={pool.poolKey}
                onClick={() => setSelectedPool(pool.poolKey)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedPool === pool.poolKey
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

      {/* Price Info */}
      {marketPrice && selectedPoolInfo && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedPoolInfo.baseCoin}/{selectedPoolInfo.quoteCoin}
              </CardTitle>
              <button
                onClick={loadPoolData}
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
                  {marketPrice.bestBidPrice.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mid Price</p>
                <p className="text-lg font-bold">
                  {marketPrice.midPrice.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Best Ask</p>
                <p className="text-lg font-bold text-red-500">
                  {marketPrice.bestAskPrice.toFixed(4)}
                </p>
              </div>
            </div>

            <TradingChart
              data={chartData}
              symbol={`${selectedPoolInfo.baseCoin}/${selectedPoolInfo.quoteCoin}`}
            />
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      <Card className="bg-blue-950/20 border-blue-900/50">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-200">
            <strong>Note:</strong> This demo uses simulated historical data. In production,
            you would fetch real-time price data from DeepBook pools and historical data
            from a DeepBook indexer. The prices shown are for demonstration purposes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
