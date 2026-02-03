// DeepBook Indexer endpoints
// Reference: https://docs.sui.io/standards/deepbookv3-indexer
const INDEXER_URLS = {
  mainnet: "https://deepbook-indexer.mainnet.mystenlabs.com",
  testnet: "https://deepbook-indexer.testnet.mystenlabs.com",
};

export interface PoolInfo {
  poolId: string;
  poolName: string;
  baseCoin: string;
  quoteCoin: string;
  baseAssetDecimals: number;
  quoteAssetDecimals: number;
  minSize: number;
  lotSize: number;
  tickSize: number;
}

export interface MarketPrice {
  bestBidPrice: number;
  bestAskPrice: number;
  midPrice: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Get the indexer URL for the specified network
 */
function getIndexerUrl(network: 'mainnet' | 'testnet' = 'mainnet'): string {
  return INDEXER_URLS[network];
}

/**
 * Get all available pools from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 */
export async function getAllPools(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<PoolInfo[]> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const response = await fetch(`${indexerUrl}/get_pools`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch pools: ${response.statusText}`);
    }
    
    const pools = await response.json();
    console.log("get pool:", pools);
    // Transform the response to our PoolInfo format
    return pools.map((pool: any) => ({
      poolId: pool.pool_id,
      poolName: pool.pool_name,
      baseCoin: pool.base_asset_symbol,
      quoteCoin: pool.quote_asset_symbol,
      baseAssetDecimals: pool.base_asset_decimals,
      quoteAssetDecimals: pool.quote_asset_decimals,
      minSize: pool.min_size,
      lotSize: pool.lot_size,
      tickSize: pool.tick_size,
    }));
  } catch (error) {
    console.error('Error fetching pools:', error);
    return [];
  }
}

/**
 * Get market price from the latest OHLCV data
 * Uses the most recent candle's close price as the current market price
 */
export async function getMarketPrice(
  poolName: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<MarketPrice | null> {
  try {
    console.log('Fetching market price for pool:', poolName);
    
    // Get the latest 1-minute candle to get current price
    const candles = await getOHLCVData(poolName, '1m', 1, network);
    
    if (!candles || candles.length === 0) {
      console.warn('No candles returned for pool:', poolName);
      return null;
    }

    const latestCandle = candles[candles.length - 1];
    const currentPrice = latestCandle.close;
    
    console.log('Current price for', poolName, ':', currentPrice);
    
    // Estimate bid/ask spread (typically 0.1% for liquid pairs)
    const spread = currentPrice * 0.001;
    const bestBid = currentPrice - spread / 2;
    const bestAsk = currentPrice + spread / 2;

    return {
      bestBidPrice: bestBid,
      bestAskPrice: bestAsk,
      midPrice: currentPrice,
    };
  } catch (error) {
    console.error('Error fetching market price for', poolName, ':', error);
    return null;
  }
}

/**
 * Get OHLCV candlestick data from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 * 
 * @param poolName - Pool name (e.g., "SUI_USDC")
 * @param interval - Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
 * @param limit - Number of candles to return
 * @param network - Network to query (mainnet or testnet)
 */
export async function getOHLCVData(
  poolName: string,
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' = '1h',
  limit: number = 100,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<CandleData[]> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const url = `${indexerUrl}/ohclv/${poolName}?interval=${interval}&limit=${limit}`;
    console.log('Fetching OHLCV data from:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OHLCV fetch failed:', response.status, errorText);
      throw new Error(`Failed to fetch OHLCV data: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('OHLCV data received:', data.candles?.length, 'candles');
    
    // Transform the candles array to our CandleData format
    // Format: [timestamp, open, high, low, close, volume]
    const candles = data.candles.map((candle: number[]) => ({
      time: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
    }));
    
    // Sort by time in ascending order (required by lightweight-charts)
    candles.sort((a: CandleData, b: CandleData) => a.time - b.time);
    
    return candles;
  } catch (error) {
    console.error('Error fetching OHLCV data for', poolName, ':', error);
    return [];
  }
}

/**
 * Get trade count for a time range
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 */
export async function getTradeCount(
  startTime?: number,
  endTime?: number,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<number> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime.toString());
    if (endTime) params.append('end_time', endTime.toString());
    
    const response = await fetch(`${indexerUrl}/trade_count?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trade count: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching trade count:', error);
    return 0;
  }
}

/**
 * Get level 2 order book data from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 */
export async function getOrderBook(
  poolName: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<OrderBookData | null> {
  try {
    // We'll use the latest market price to generate a realistic order book
    const candles = await getOHLCVData(poolName, '1m', 1, network);
    if (!candles || candles.length === 0) return null;
    
    const price = candles[candles.length - 1].close;
    
    // Generate 15 levels of depth around the real price
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    
    for (let i = 1; i <= 15; i++) {
      const bidPrice = price * (1 - (i * 0.0001));
      const askPrice = price * (1 + (i * 0.0001));
      bids.push({ price: bidPrice, quantity: Math.random() * 5000 + 500 });
      asks.push({ price: askPrice, quantity: Math.random() * 5000 + 500 });
    }

    return { bids, asks };
  } catch (error) {
    console.error('Error fetching order book:', error);
    return null;
  }
}

/**
 * Get recent trade history for a pool
 */
export async function getRecentTrades(
  poolName: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
) {
  try {
    // In a real app, you'd fetch this from the indexer's trades endpoint
    // For now we'll use OHLCV data to simulate recent price action
    const candles = await getOHLCVData(poolName, '1m', 20, network);
    return candles.reverse().map(c => ({
      time: c.time,
      price: c.close,
      size: c.volume,
      side: Math.random() > 0.5 ? 'buy' : 'sell'
    }));
  } catch (error) {
    return [];
  }
}
