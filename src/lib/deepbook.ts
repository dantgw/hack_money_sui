import { SuiGrpcClient } from '@mysten/sui/grpc';

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { DeepBookClient } from '@mysten/deepbook-v3';

// DeepBook Indexer endpoints
// Reference: https://docs.sui.io/standards/deepbookv3-indexer
const INDEXER_URLS = {
  mainnet: "https://deepbook-indexer.mainnet.mystenlabs.com",
  testnet: "https://deepbook-indexer.testnet.mystenlabs.com",
  devnet: "https://deepbook-indexer.devnet.mystenlabs.com",
};

const RPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
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
function getIndexerUrl(network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string {
  return INDEXER_URLS[network];
}

/**
 * Get all available pools from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 */
export async function getAllPools(network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): Promise<PoolInfo[]> {
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
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
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
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
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
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
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

// =============== BalanceManager Functions ===============

/**
 * DeepBook V3 package IDs
 * Reference: https://docs.sui.io/standards/deepbookv3/contract-information
 */
export const DEEPBOOK_PACKAGE_IDS = {
  mainnet: '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497',
  testnet: '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c',
} as const;

export const DEEPBOOK_BALANCE_MANAGER_PACKAGE_IDS = {
  mainnet: '0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a',
  testnet: '0x984757fc7c0e6dd5f15c2c66e881dd6e5aca98b725f3dbd83c445e057ebb790a',
} as const;


export const REGISTRY_ID = {
  mainnet: "0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d",
  testnet: "0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1",
} as const;

export function getRegistryId(network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string {
  // Map devnet to testnet since they share the same registry
  const networkKey = network === 'devnet' ? 'testnet' : network;
  return REGISTRY_ID[networkKey];
}

/**
 * Get the DeepBook package ID for the current network
 */
export function getDeepBookPackageId(network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string {
  // Map devnet to testnet since they share the same package IDs
  const networkKey = network === 'devnet' ? 'testnet' : network;
  return DEEPBOOK_PACKAGE_IDS[networkKey];
}

export function getDeepBookBalanceManagerPackageId(network: 'mainnet' | 'testnet' = 'mainnet'): string {
  return DEEPBOOK_BALANCE_MANAGER_PACKAGE_IDS[network];
}



/**
 * Get BalanceManager for a user
 * Note: BalanceManager is a shared object after creation.
 * This function queries the Registry to find the user's BalanceManager IDs.
 * Returns null if no BalanceManager exists
 */
export async function getBalanceManager(
  _client: SuiGrpcClient,
  userAddress: string,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
): Promise<string | null> {

  const deepbookPackageId = getDeepBookPackageId(network);
  const registryId = getRegistryId(network);

  // Query the Registry to get BalanceManager IDs for the user

  const tx = new Transaction();

  const jsonRpcClient = new SuiJsonRpcClient({ network, url: RPC_URLS[network] });

  tx.moveCall({
    target: `${deepbookPackageId}::registry::get_balance_manager_ids`,
    arguments: [
      tx.object(registryId),
      tx.pure.address(userAddress),
    ],

  });
  tx.setSender(userAddress);



  // Simulate the transaction to get the return value (VecSet<ID>)
  let result


  // Build the transaction bytes
  result = await jsonRpcClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: userAddress,
  });

  // Parse the return values from simulation
  let balanceManagerIds: string[] = [];

  // Get the return value directly from devInspectTransactionBlock
  const returnValue = result.results?.[0]?.returnValues?.[0];

  if (returnValue && Array.isArray(returnValue)) {
    // returnValue is [bytes, type] tuple format
    const bcsData = returnValue[0];

    if (bcsData && Array.isArray(bcsData)) {
      try {
        // Parse the VecSet<ID> from BCS bytes
        const { bcs } = await import('@mysten/sui/bcs');
        const vecSet = bcs.vector(bcs.Address).parse(new Uint8Array(bcsData));
        balanceManagerIds = vecSet;
        console.log("BalanceManager IDs from Registry:", balanceManagerIds);
      } catch (parseError) {
        console.error("Error parsing BCS data:", parseError);
      }
    }
  }

  // If no BalanceManager found in registry
  if (balanceManagerIds.length === 0) {
    return null;
  }

  // Get the first (most recent) BalanceManager
  const balanceManagerId = balanceManagerIds[0];

  return balanceManagerId
}

/**
 * Get balance for a specific coin type in the BalanceManager
 * Note: This function uses transaction simulation to read the balance
 */
export async function getBalanceForCoin(
  _client: SuiGrpcClient,
  userAddress: string,
  balanceManagerId: string,
  coinType: string,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
): Promise<bigint> {
  try {
    const packageId = getDeepBookPackageId(network);

    // Create a transaction to call the balance view function
    const tx = new Transaction();

    tx.moveCall({
      target: `${packageId}::balance_manager::balance`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId)],
    });

    // Use JsonRpc client devInspectTransactionBlock, similar to getBalanceManager
    const jsonRpcClient = new SuiJsonRpcClient({ network, url: RPC_URLS[network] });

    const result = await jsonRpcClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: userAddress,
    });
    console.log("result for balance:", result);
    // Parse the return values from simulation
    const returnValue = result.results?.[0]?.returnValues?.[0];

    if (returnValue && Array.isArray(returnValue)) {
      // returnValue is [bytes, type] tuple format
      const bcsData = returnValue[0];

      if (bcsData && Array.isArray(bcsData)) {
        try {
          // Parse the returned u64 balance from BCS bytes
          // u64 is 8 bytes in little-endian format
          const bytes = new Uint8Array(bcsData);
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          return view.getBigUint64(0, true); // true = little-endian
        } catch (parseError) {
          console.error("Error parsing balance BCS data:", parseError);
        }
      }
    }

    return 0n;
  } catch (error) {
    console.error('Error getting balance for coin:', error);
    return 0n;
  }
}

// =============== Order Placement Functions ===============

/**
 * Place a limit order using DeepBook SDK
 * @param tx - Transaction object to add the order to
 * @param client - Sui client instance
 * @param userAddress - User's address
 * @param poolInfo - Pool information including poolId and coin symbols
 * @param balanceManagerId - BalanceManager ID for the user
 * @param side - 'buy' or 'sell'
 * @param price - Price in quote asset (e.g., USDC)
 * @param quantity - Quantity in base asset (e.g., SUI)
 * @param network - Network to use (mainnet or testnet)
 * @param clientOrderId - Optional client order ID (defaults to timestamp-based ID)
 */
export function placeLimitOrder(
  tx: Transaction,
  client: SuiGrpcClient,
  userAddress: string,
  poolInfo: PoolInfo,
  balanceManagerId: string,
  side: 'buy' | 'sell',
  price: number,
  quantity: number,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  clientOrderId?: string
): void {
  try {
    // Initialize DeepBookClient with the client and user address
    // Map devnet to testnet since DeepBook SDK may not support devnet directly

    const deepBookClient = new DeepBookClient({
      client,
      address: userAddress,
      network: network,
      // Register pool and balance manager using their IDs as keys
      pools: {
        [poolInfo.poolId]: {
          address: poolInfo.poolId,
          baseCoin: poolInfo.baseCoin, // Use coin symbol from pool info
          quoteCoin: poolInfo.quoteCoin, // Use coin symbol from pool info
        },
      },
      balanceManagers: {
        'default': {
          address: balanceManagerId,
        },
      },
    });

    const isBid = side === 'buy';
    // clientOrderId must be a string that represents a u64 number
    // The SDK will convert it to u64 in the transaction
    const orderId = clientOrderId || Date.now().toString();

    // Use a simple key for the balance manager (the SDK uses this to look it up in config)
    const balanceManagerKey = 'default';

    // Set the transaction sender to the user address
    // This is required for generateProofAsOwner to work correctly
    tx.setSender(userAddress);

    // Place the limit order
    const placeOrder = deepBookClient.deepBook.placeLimitOrder({
      poolKey: poolInfo.poolId,
      balanceManagerKey: balanceManagerKey,
      clientOrderId: orderId,
      price,
      quantity,
      isBid,
    });

    // Apply the order placement to the transaction
    placeOrder(tx);
  } catch (error) {
    console.error('Error placing limit order:', error);
    throw error;
  }
}

/**
 * Place a market order using DeepBook SDK
 * @param tx - Transaction object to add the order to
 * @param client - Sui client instance
 * @param userAddress - User's address
 * @param poolInfo - Pool information including poolId and coin symbols
 * @param balanceManagerId - BalanceManager ID for the user
 * @param side - 'buy' or 'sell'
 * @param quantity - Quantity in base asset (e.g., SUI)
 * @param network - Network to use (mainnet or testnet)
 * @param clientOrderId - Optional client order ID (defaults to timestamp-based ID)
 */
export function placeMarketOrder(
  tx: Transaction,
  client: SuiGrpcClient,
  userAddress: string,
  poolInfo: PoolInfo,
  balanceManagerId: string,
  side: 'buy' | 'sell',
  quantity: number,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  clientOrderId?: string
): void {
  try {
    // Initialize DeepBookClient with the client and user address
    // Map devnet to testnet since DeepBook SDK may not support devnet directly
    const sdkNetwork = network === 'devnet' ? 'testnet' : network;
    const deepBookClient = new DeepBookClient({
      client,
      address: userAddress,
      network: sdkNetwork,
      // Register pool and balance manager using their IDs as keys
      pools: {
        [poolInfo.poolId]: {
          address: poolInfo.poolId,
          baseCoin: poolInfo.baseCoin, // Use coin symbol from pool info
          quoteCoin: poolInfo.quoteCoin, // Use coin symbol from pool info
        },
      },
      balanceManagers: {
        'default': {
          address: balanceManagerId,
        },
      },
    });

    const isBid = side === 'buy';
    // clientOrderId must be a string that represents a u64 number
    // The SDK will convert it to u64 in the transaction
    const orderId = clientOrderId || Date.now().toString();

    // Use a simple key for the balance manager (the SDK uses this to look it up in config)
    const balanceManagerKey = 'default';

    // Set the transaction sender to the user address
    // This is required for generateProofAsOwner to work correctly


    // Place the market order
    const placeOrder = deepBookClient.deepBook.placeMarketOrder({
      poolKey: poolInfo.poolId,
      balanceManagerKey: balanceManagerKey,
      clientOrderId: orderId,
      quantity,
      isBid,
    });

    // Apply the order placement to the transaction
    placeOrder(tx);
  } catch (error) {
    console.error('Error placing market order:', error);
    throw error;
  }
}

// =============== Order Management Functions ===============

export interface Order {
  order_id: string;
  pool_name: string;
  balance_manager_id: string;
  client_order_id: string;
  order_type: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  filled_quantity: number;
  remaining_quantity: number;
  status: string;
  timestamp: number;
  is_bid: boolean;
}

/**
 * Get orders for a balance manager from DeepBook Indexer
 * Reference: https://docs.sui.io/standards/deepbookv3-indexer
 * 
 * @param poolName - Pool name (e.g., "SUI_USDC")
 * @param balanceManagerId - BalanceManager ID
 * @param network - Network to query (mainnet or testnet)
 * @param limit - Number of orders to return (default: 100)
 * @param status - Order status filter (e.g., "open", "filled", "canceled")
 */
export async function getOrders(
  poolName: string,
  balanceManagerId: string,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
): Promise<Order[]> {
  try {
    const indexerUrl = getIndexerUrl(network);



    const url = `${indexerUrl}/orders/${poolName}/${balanceManagerId}`;
    console.log("url:", url);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Orders fetch failed:', response.status, errorText);
      // Return empty array if no orders found (404) rather than throwing
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data: any[] = await response.json();
    console.log("orders:", data);
    // Transform the orders to our Order format
    const orders: Order[] = data.map((order: any) => {
      // Handle timestamp conversion (API may return seconds or milliseconds)
      let timestamp = order.timestamp || order.created_at || Date.now();
      // If timestamp is in seconds (less than 13 digits), convert to milliseconds
      if (timestamp < 1000000000000) {
        timestamp = timestamp * 1000;
      }

      // Determine side from multiple possible fields
      let side: 'buy' | 'sell' = 'sell';
      if (order.is_bid !== undefined) {
        side = order.is_bid ? 'buy' : 'sell';
      } else if (order.type) {
        side = order.type.toLowerCase() === 'buy' ? 'buy' : 'sell';
      } else if (order.side) {
        side = order.side.toLowerCase() === 'buy' ? 'buy' : 'sell';
      }

      return {
        order_id: order.order_id || order.orderId,
        pool_name: order.pool_name || order.poolName,
        balance_manager_id: order.balance_manager_id || order.balanceManagerId,
        client_order_id: order.client_order_id || order.clientOrderId,
        order_type: order.order_type || order.orderType || 'limit',
        side,
        price: parseFloat(order.price || '0'),
        quantity: parseFloat(order.quantity || order.base_asset_quantity || order.original_quantity || '0'),
        filled_quantity: parseFloat(order.filled_quantity || order.filledQuantity || '0'),
        remaining_quantity: parseFloat(order.remaining_quantity || order.remainingQuantity || order.quantity - (order.filled_quantity || order.filledQuantity || 0)),
        status: order.status || order.current_status || 'open',
        timestamp: timestamp || order.placed_at || order.last_updated_at || Date.now(),
        is_bid: side === 'buy',
      };
    });

    return orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

/**
 * Cancel an order using DeepBook SDK
 * @param tx - Transaction object to add the cancel to
 * @param client - Sui client instance
 * @param userAddress - User's address
 * @param poolInfo - Pool information including poolId and coin symbols
 * @param balanceManagerId - BalanceManager ID for the user
 * @param orderId - Order ID to cancel (u128 as string)
 * @param network - Network to use (mainnet or testnet)
 */
export function cancelOrder(
  tx: Transaction,
  client: SuiGrpcClient,
  userAddress: string,
  poolInfo: PoolInfo,
  balanceManagerId: string,
  orderId: string,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
): void {
  try {
    // Initialize DeepBookClient with the client and user address
    const sdkNetwork = network === 'devnet' ? 'testnet' : network;
    const deepBookClient = new DeepBookClient({
      client,
      address: userAddress,
      network: sdkNetwork,
      // Register pool and balance manager using their IDs as keys
      pools: {
        [poolInfo.poolId]: {
          address: poolInfo.poolId,
          baseCoin: poolInfo.baseCoin,
          quoteCoin: poolInfo.quoteCoin,
        },
      },
      balanceManagers: {
        'default': {
          address: balanceManagerId,
        },
      },
    });

    // Set the transaction sender to the user address
    tx.setSender(userAddress);

    // Cancel the order using the SDK
    const cancelOrderFn = deepBookClient.deepBook.cancelOrder(
      poolInfo.poolId,
      'default',
      orderId
    );

    // Apply the cancel order to the transaction
    cancelOrderFn(tx);
  } catch (error) {
    console.error('Error canceling order:', error);
    throw error;
  }
}
