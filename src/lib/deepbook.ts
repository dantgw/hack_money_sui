import type { ClientWithCoreApi } from '@mysten/sui/client';

export interface PoolInfo {
  poolId: string;
  baseCoin: string;
  quoteCoin: string;
  poolKey: string;
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

/**
 * Initialize DeepBook functionality with the dApp kit's client
 * This avoids version conflicts by using the same client instance
 */
export function initDeepBook(client: ClientWithCoreApi) {
  return {
    client,
  };
}

/**
 * Get all available pools from DeepBook
 * These are the main pools available on DeepBook V3
 */
export async function getAllPools(): Promise<PoolInfo[]> {
  try {
    // DeepBook V3 has predefined pools, here are some common ones
    const commonPools: PoolInfo[] = [
      {
        poolId: 'DEEP_SUI',
        baseCoin: 'DEEP',
        quoteCoin: 'SUI',
        poolKey: 'DEEP_SUI',
      },
      {
        poolId: 'SUI_USDC',
        baseCoin: 'SUI',
        quoteCoin: 'USDC',
        poolKey: 'SUI_USDC',
      },
      {
        poolId: 'DEEP_USDC',
        baseCoin: 'DEEP',
        quoteCoin: 'USDC',
        poolKey: 'DEEP_USDC',
      },
    ];

    return commonPools;
  } catch (error) {
    console.error('Error fetching pools:', error);
    return [];
  }
}

/**
 * Get market price for a specific pool
 */
export async function getMarketPrice(
  poolKey: string
): Promise<MarketPrice | null> {
  try {
    // Query the order book to get best bid/ask
    const orderBook = await getOrderBook(poolKey);
    
    if (!orderBook || orderBook.bids.length === 0 || orderBook.asks.length === 0) {
      return null;
    }

    const bestBid = orderBook.bids[0].price;
    const bestAsk = orderBook.asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;

    return {
      bestBidPrice: bestBid,
      bestAskPrice: bestAsk,
      midPrice,
    };
  } catch (error) {
    console.error('Error fetching market price:', error);
    return null;
  }
}

/**
 * Get level 2 order book data
 * In production, you would query the actual DeepBook pool state using the Sui client
 * For now, returning mock data to demonstrate the UI
 */
export async function getOrderBook(
  poolKey: string
): Promise<OrderBookData | null> {
  try {
    // In production, you would:
    // 1. Get the pool address from the DeepBook registry
    // 2. Query the pool object using client.getObject()
    // 3. Parse the order book from the pool's dynamic fields
    
    // For demonstration, return mock data based on the pool
    const basePrice = poolKey === 'DEEP_SUI' ? 0.045 : poolKey === 'SUI_USDC' ? 2.45 : 0.11;
    
    const mockBids: OrderBookLevel[] = [
      { price: basePrice * 0.999, quantity: 1000 },
      { price: basePrice * 0.998, quantity: 1500 },
      { price: basePrice * 0.997, quantity: 2000 },
      { price: basePrice * 0.996, quantity: 2500 },
      { price: basePrice * 0.995, quantity: 3000 },
    ];

    const mockAsks: OrderBookLevel[] = [
      { price: basePrice * 1.001, quantity: 1200 },
      { price: basePrice * 1.002, quantity: 1800 },
      { price: basePrice * 1.003, quantity: 2200 },
      { price: basePrice * 1.004, quantity: 2800 },
      { price: basePrice * 1.005, quantity: 3500 },
    ];

    return {
      bids: mockBids,
      asks: mockAsks,
    };
  } catch (error) {
    console.error('Error fetching order book:', error);
    return null;
  }
}

/**
 * Generate mock historical price data for demonstration
 * In production, you'd fetch real historical data from an indexer
 */
export function generateMockPriceHistory(days: number = 30, basePrice: number = 2.5) {
  const data = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let price = basePrice;

  for (let i = days; i >= 0; i--) {
    const time = now - i * dayMs;
    const volatility = 0.05;
    const change = (Math.random() - 0.5) * volatility * price;
    price = Math.max(basePrice * 0.5, price + change);

    data.push({
      time: Math.floor(time / 1000),
      open: price,
      high: price * (1 + Math.random() * 0.02),
      low: price * (1 - Math.random() * 0.02),
      close: price + change,
      volume: Math.random() * 10000,
    });
  }

  return data;
}
