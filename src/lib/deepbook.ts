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
    
    // Get the latest 1-minute candle to get current price
    const candles = await getOHLCVData(poolName, '1m', 1, undefined, undefined, network);
    
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
 * @param startTime - Unix timestamp (seconds) - start of time range for pagination
 * @param endTime - Unix timestamp (seconds) - end of time range for pagination
 * @param network - Network to query (mainnet or testnet)
 */
export async function getOHLCVData(
  poolName: string,
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' = '1h',
  limit: number = 100,
  startTime?: number,
  endTime?: number,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<CandleData[]> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const params = new URLSearchParams({
      interval,
      limit: limit.toString(),
    });
    
    // Add start_time parameter if provided (for pagination)
    if (startTime !== undefined) {
      params.append('start_time', startTime.toString());
    }
    
    // Add end_time parameter if provided (for pagination)
    if (endTime !== undefined) {
      params.append('end_time', endTime.toString());
    }
    
    const url = `${indexerUrl}/ohclv/${poolName}?${params.toString()}`;
    
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OHLCV fetch failed:', response.status, errorText);
      throw new Error(`Failed to fetch OHLCV data: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    
    // Transform the candles array to our CandleData format
    // Format: [timestamp, open, high, low, close, volume]
    // API returns Unix timestamps in seconds, but we need to ensure they're in seconds format
    const candles = data.candles.map((candle: number[]) => {
      // Convert timestamp to seconds if it's in milliseconds (13+ digits)
      // Unix timestamps in seconds are typically 10 digits (before year 2286)
      // Timestamps >= 10000000000 are likely milliseconds
      const timestamp = candle[0];
      const timestampSeconds = timestamp >= 10000000000 
        ? Math.floor(timestamp / 1000)
        : timestamp;
      
      return {
        time: timestampSeconds,
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
      };
    });
    
    // Sort by time in ascending order (required by lightweight-charts)
    candles.sort((a: CandleData, b: CandleData) => a.time - b.time);
    
    return candles;
  } catch (error) {
    console.error('Error fetching OHLCV data for', poolName, ':', error);
    return [];
  }
}


interface DeepBookOrderBookResponse {
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
  timestamp: string;
}

/**
 * Get level 2 order book data from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 * 
 * @param poolName - Pool name (e.g., "SUI_USDC")
 * @param level - Order book level (default: 2)
 * @param depth - Number of price levels to return (0 = all, default: 0)
 * @param network - Network to query (mainnet or testnet)
 */
export async function getOrderBook(
  poolName: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
  level: number = 2,
  depth: number = 30
): Promise<OrderBookData | null> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const params = new URLSearchParams({
      level: level.toString(),
      depth: depth.toString(),
    });
    
    const url = `${indexerUrl}/orderbook/${poolName}?${params.toString()}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Order book fetch failed:', response.status, errorText);
      throw new Error(`Failed to fetch order book: ${response.statusText}`);
    }
    
    const data: DeepBookOrderBookResponse = await response.json();
    
    // Transform the order book data to our format
    const bids: OrderBookLevel[] = data.bids.map(([price, quantity]) => ({
      price: parseFloat(price),
      quantity: parseFloat(quantity),
    }));
    
    const asks: OrderBookLevel[] = data.asks.map(([price, quantity]) => ({
      price: parseFloat(price),
      quantity: parseFloat(quantity),
    }));
    
    return { bids, asks };
  } catch (error) {
    console.error('Error fetching order book:', error);
    return null;
  }
}

export interface Trade {
  id: string;
  time: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

interface DeepBookTradeResponse {
  taker_fee: number;
  maker_fee_is_deep: boolean;
  taker_client_order_id: string;
  digest: string;
  base_volume: number;
  taker_is_bid: boolean;
  timestamp: number;
  maker_order_id: string;
  taker_fee_is_deep: boolean;
  quote_volume: number;
  type: string;
  price: number;
  maker_fee: number;
  trade_id: string;
  maker_client_order_id: string;
  taker_balance_manager_id: string;
  maker_balance_manager_id: string;
  event_digest: string;
  taker_order_id: string;
}

/**
 * Get recent trade history for a pool from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 * 
 * @param poolName - Pool name (e.g., "SUI_USDC")
 * @param limit - Number of trades to return (default: 50)
 * @param startTime - Unix timestamp in seconds (optional)
 * @param endTime - Unix timestamp in seconds (optional)
 * @param network - Network to query (mainnet or testnet)
 */
export async function getRecentTrades(
  poolName: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
  limit: number = 50,
  startTime?: number,
  endTime?: number
): Promise<Trade[]> {
  try {
    const indexerUrl = getIndexerUrl(network);
    const params = new URLSearchParams();
    
    if (limit) {
      params.append('limit', limit.toString());
    }
    
    if (startTime !== undefined) {
      params.append('start_time', startTime.toString());
    }
    
    if (endTime !== undefined) {
      params.append('end_time', endTime.toString());
    }
    
    const url = `${indexerUrl}/trades/${poolName}${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Trades fetch failed:', response.status, errorText);
      throw new Error(`Failed to fetch trades: ${response.statusText}`);
    }
    
    const data: DeepBookTradeResponse[] = await response.json();
    
    // Sort by timestamp descending (most recent first) before transforming
    data.sort((a, b) => b.timestamp - a.timestamp);
    
    // Transform the trades to our Trade format
    // Use taker_is_bid to determine side: true = buy, false = sell
    const trades: Trade[] = data.map((trade) => ({
      id: trade.trade_id,
      time: Math.floor(trade.timestamp / 1000), // Convert from milliseconds to seconds
      price: trade.price,
      size: trade.base_volume,
      side: trade.taker_is_bid ? 'buy' : 'sell',
    }));
    
    return trades;
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    return [];
  }
}
