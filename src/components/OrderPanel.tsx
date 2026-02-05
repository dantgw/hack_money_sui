import { useState, useEffect } from 'react';
import { useCurrentAccount, ConnectButton, useCurrentClient, useDAppKit, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { Button } from './ui/button';
import { getDeepBookPackageId, getBalanceManager, getRegistryId, getBalanceForCoin, PoolInfo } from '../lib/deepbook';
import { Loader2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const COIN_TYPE_MAP: Record<'mainnet' | 'testnet', Record<string, string>> = {
    mainnet: {
        SUI: '0x2::sui::SUI',
        DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
        USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        BETH: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
        WUSDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
        WUSDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
        NS: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS',
        TYPUS: '0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS',
        AUSD: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD',
        DRF: '0x294de7579d55c110a00a7c4946e09a1b5cbeca2592fbb83fd7bfacba3cfeaf0e::drf::DRF',
        SEND: '0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND',
        XBTC: '0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC',
        WAL: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
        IKA: '0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA',
        ALKIMI: '0x1a8f4bc33f8ef7fbc851f156857aa65d397a6a6fd27a7ac2ca717b51f2fd9489::alkimi::ALKIMI',
        WBTC: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC'
        // TODO: Add additional mainnet coin types (e.g. DEEP, USDC, etc.)
    },
    testnet: {
        SUI: '0x2::sui::SUI',
        DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
        DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
        DBUSDT: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT',
        WAL: '0x9ef7676a9f81937a52ae4b2af8d511a28a0b080477c0c2db40b0ab8882240d76::wal::WAL',
        DBTC: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC'
    },
};

function getTypeArgumentsForPool(
    network: 'mainnet' | 'testnet',
    poolInfo: PoolInfo,
): [string, string] {
    const baseType = COIN_TYPE_MAP[network]?.[poolInfo.baseCoin];
    const quoteType = COIN_TYPE_MAP[network]?.[poolInfo.quoteCoin];

    if (!baseType || !quoteType) {
        throw new Error(
            `Missing coin type mapping for ${network}: base=${poolInfo.baseCoin}, quote=${poolInfo.quoteCoin}`,
        );
    }

    return [baseType, quoteType];
}

interface OrderPanelProps {
    poolInfo: PoolInfo | null;
    currentPrice: number;
    selectedPriceFromOrderBook?: number | null;
}

export function OrderPanel({ poolInfo, currentPrice, selectedPriceFromOrderBook }: OrderPanelProps) {
    const currentAccount = useCurrentAccount();
    const client = useCurrentClient();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();

    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
    const [price, setPrice] = useState(currentPrice.toString());
    const [size, setSize] = useState('10');

    // BalanceManager state
    const [balanceManager, setBalanceManager] = useState<string | null>(null);
    const [balance, setBalance] = useState<number | null>(0); // SUI balance in BalanceManager
    const [baseBalance, setBaseBalance] = useState<number | null>(null);
    const [quoteBalance, setQuoteBalance] = useState<number | null>(null);

    const [isLoadingBalanceManager, setIsLoadingBalanceManager] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);

    const baseSymbol = poolInfo?.baseCoin || 'SUI';
    const quoteSymbol = poolInfo?.quoteCoin || 'USDC';

    // When user clicks on an order book row, switch to limit order and set the price
    useEffect(() => {
        if (selectedPriceFromOrderBook != null) {
            setOrderType('limit');
            setPrice(selectedPriceFromOrderBook.toString());
        }
    }, [selectedPriceFromOrderBook]);

    // Fetch BalanceManager when account changes
    useEffect(() => {
        const fetchBalanceManager = async () => {
            if (!currentAccount?.address) {
                setBalanceManager(null);
                return;
            }

            setIsLoadingBalanceManager(true);
            try {
                const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);

                let suiBalance = 0;
                if (bm) {
                    // SUI balance (always available for deposit / withdraw UI)
                    suiBalance = Number(
                        await getBalanceForCoin(
                            client,
                            currentAccount.address,
                            bm,
                            '0x2::sui::SUI',
                            network,
                        ),
                    ) / 1_000_000_000;

                    // Pool-specific balances for Available display
                    if (poolInfo && (currentNetwork === 'mainnet' || currentNetwork === 'testnet')) {
                        const networkKey = currentNetwork as 'mainnet' | 'testnet';
                        const baseType = COIN_TYPE_MAP[networkKey]?.[poolInfo.baseCoin];
                        const quoteType = COIN_TYPE_MAP[networkKey]?.[poolInfo.quoteCoin];

                        if (baseType) {
                            const rawBase = await getBalanceForCoin(
                                client,
                                currentAccount.address,
                                bm,
                                baseType,
                                network,
                            );
                            console.log("rawBase:", rawBase);
                            console.log("poolInfo.baseAssetDecimals:", poolInfo.baseAssetDecimals);
                            console.log("Number(rawBase) / Math.pow(10, poolInfo.baseAssetDecimals):", Number(rawBase) / Math.pow(10, poolInfo.baseAssetDecimals));
                            setBaseBalance(
                                Number(rawBase) / Math.pow(10, poolInfo.baseAssetDecimals),
                            );
                        } else {
                            setBaseBalance(null);
                        }

                        if (quoteType) {
                            const rawQuote = await getBalanceForCoin(
                                client,
                                currentAccount.address,
                                bm,
                                quoteType,
                                network,
                            );
                            console.log("rawQuote:", rawQuote);
                            console.log("poolInfo.quoteAssetDecimals:", poolInfo.quoteAssetDecimals);
                            console.log("Number(rawQuote) / Math.pow(10, poolInfo.quoteAssetDecimals):", Number(rawQuote) / Math.pow(10, poolInfo.quoteAssetDecimals));
                            setQuoteBalance(
                                Number(rawQuote) / Math.pow(10, poolInfo.quoteAssetDecimals),
                            );
                        } else {
                            setQuoteBalance(null);
                        }
                    } else {
                        setBaseBalance(null);
                        setQuoteBalance(null);
                    }
                } else {
                    setBaseBalance(null);
                    setQuoteBalance(null);
                }

                setBalanceManager(bm);
                setBalance(suiBalance);
            } catch (error) {
                console.error('Error fetching BalanceManager:', error);
                setBalanceManager(null);
                setBaseBalance(null);
                setQuoteBalance(null);
            } finally {
                setIsLoadingBalanceManager(false);
            }
        };

        fetchBalanceManager();
        // Refresh every 10 seconds
        const interval = setInterval(fetchBalanceManager, 10000);
        return () => clearInterval(interval);
    }, [currentAccount?.address, client, currentNetwork, poolInfo]);

    // Handle deposit with BalanceManager creation if needed
    const handleDeposit = async () => {
        if (!currentAccount?.address || !depositAmount) return;

        setIsDepositing(true);
        try {
            const tx = new Transaction();
            const amountInMist = BigInt(Math.floor(parseFloat(depositAmount) * 1_000_000_000)); // Convert SUI to MIST
            const network = currentNetwork as 'mainnet' | 'testnet';
            const packageId = getDeepBookPackageId(network);

            // Split coins for the deposit
            const [coin] = tx.splitCoins(tx.gas, [amountInMist]);

            if (!balanceManager) {
                // Create new BalanceManager and deposit in one transaction
                console.log('Creating new BalanceManager and depositing...');

                const registryId = getRegistryId(network);

                // Create BalanceManager
                const [newBalanceManager] = tx.moveCall({
                    target: `${packageId}::balance_manager::new`,
                    arguments: [],
                });

                // Deposit the SUI
                tx.moveCall({
                    target: `${packageId}::balance_manager::deposit`,
                    typeArguments: ['0x2::sui::SUI'],
                    arguments: [
                        newBalanceManager,
                        coin,
                    ],
                });

                // Register the BalanceManager with the Registry BEFORE sharing
                // (Once shared, we can't use it by value anymore)
                tx.moveCall({
                    target: `${packageId}::balance_manager::register_balance_manager`,
                    arguments: [
                        newBalanceManager,
                        tx.object(registryId),
                    ],
                });

                // Share the BalanceManager (must be last!)
                tx.moveCall({
                    target: '0x2::transfer::public_share_object',
                    typeArguments: [`${packageId}::balance_manager::BalanceManager`],
                    arguments: [newBalanceManager],
                });
            } else {
                // Deposit to existing BalanceManager
                console.log('Depositing to existing BalanceManager...');

                tx.moveCall({
                    target: `${packageId}::balance_manager::deposit`,
                    typeArguments: ['0x2::sui::SUI'],
                    arguments: [
                        tx.object(balanceManager),
                        coin,
                    ],
                });
            }

            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === 'FailedTransaction') {
                throw new Error('Transaction failed');
            }

            console.log('Deposit successful:', result);
            setDepositAmount('');
            toast.success('Deposit successful', {
                description: `${depositAmount} SUI has been deposited to your BalanceManager`,
            });

            // Refresh BalanceManager
            setTimeout(async () => {
                const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                setBalanceManager(bm);
            }, 2000);
        } catch (error) {
            console.error('Deposit failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Deposit failed', {
                description: errorMessage,
            });
        } finally {
            setIsDepositing(false);
        }
    };

    // Handle withdrawal
    const handleWithdraw = async () => {
        if (!currentAccount?.address || !withdrawAmount || !balanceManager) return;

        setIsWithdrawing(true);
        try {
            const tx = new Transaction();
            const amountInMist = BigInt(Math.floor(parseFloat(withdrawAmount) * 1_000_000_000)); // Convert SUI to MIST
            const network = currentNetwork as 'mainnet' | 'testnet';
            const packageId = getDeepBookPackageId(network);

            // Withdraw from BalanceManager
            const [coin] = tx.moveCall({
                target: `${packageId}::balance_manager::withdraw`,
                typeArguments: ['0x2::sui::SUI'],
                arguments: [
                    tx.object(balanceManager),
                    tx.pure.u64(amountInMist),
                ],
            });

            // Transfer the withdrawn coin to the user
            tx.transferObjects([coin], currentAccount.address);

            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === 'FailedTransaction') {
                throw new Error('Transaction failed');
            }

            console.log('Withdrawal successful:', result);
            setWithdrawAmount('');
            toast.success('Withdrawal successful', {
                description: `${withdrawAmount} SUI has been withdrawn from your BalanceManager`,
            });

            // Refresh BalanceManager
            setTimeout(async () => {
                const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                setBalanceManager(bm);
            }, 2000);
        } catch (error) {
            console.error('Withdrawal failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Withdrawal failed', {
                description: errorMessage,
            });
        } finally {
            setIsWithdrawing(false);
        }
    };

    // Handle order placement
    const handlePlaceOrder = async () => {
        if (!currentAccount?.address || !poolInfo || !balanceManager || !size) {
            toast.error('Missing required fields', {
                description: 'Please fill in all required fields before placing an order',
            });
            return;
        }

        if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
            toast.error('Invalid price', {
                description: 'Please enter a valid price for your limit order',
            });
            return;
        }

        if (parseFloat(size) < 10) {
            toast.error('Invalid size', {
                description: 'Minimum order size is 10',
            });
            return;
        }

        setIsPlacingOrder(true);
        try {
            const tx = new Transaction();
            tx.setSender(currentAccount.address);
            const network = currentNetwork as 'mainnet' | 'testnet';
            const priceNum = parseFloat(price || '0');
            const sizeNum = parseFloat(size);
            if (orderType === 'limit') {
                const packageId = getDeepBookPackageId(network);
                const typeArguments = getTypeArgumentsForPool(network, poolInfo);

                // Generate trade proof
                const [proof] = tx.moveCall({
                    target: `${packageId}::balance_manager::generate_proof_as_owner`,
                    arguments: [tx.object(balanceManager)],
                });

                // Calculate scaled price and quantity
                // Price scaling: (price * FLOAT_SCALAR * quoteCoin.scalar) / baseCoin.scalar
                // Quantity scaling: quantity * baseCoin.scalar
                const FLOAT_SCALAR = 1_000_000_000; // 10^9
                const baseCoinScalar = Math.pow(10, poolInfo.baseAssetDecimals);
                const quoteCoinScalar = Math.pow(10, poolInfo.quoteAssetDecimals);
                const scaledPrice = Math.round((priceNum * FLOAT_SCALAR * quoteCoinScalar) / baseCoinScalar);
                const scaledQuantity = Math.round(sizeNum * baseCoinScalar);

                // Generate client order ID (use timestamp)
                const clientOrderId = BigInt(Date.now());

                // Order type: 0 = NO_RESTRICTION, 1 = IMMEDIATE_OR_CANCEL, 2 = FILL_OR_KILL, 3 = POST_ONLY
                const orderTypeValue = 0; // NO_RESTRICTION

                // Self matching option: 0 = SELF_MATCHING_ALLOWED, 1 = CANCEL_TAKER, 2 = CANCEL_MAKER
                const selfMatchingOption = 0; // SELF_MATCHING_ALLOWED

                // Expiration timestamp (use max timestamp for no expiration, or set a future date)
                const MAX_TIMESTAMP = 1_844_674_407_370_955_161n; // Max u64 timestamp
                const expireTimestamp = MAX_TIMESTAMP;

                // Pay with DEEP (true = use DEEP token, false = use base/quote assets)
                const payWithDeep = false;

                // Is bid: true for buy orders, false for sell orders
                const isBid = side === 'buy';

                tx.moveCall({
                    target: `${packageId}::pool::place_limit_order`,
                    typeArguments,
                    arguments: [
                        tx.object(poolInfo.poolId),        // self: Pool
                        tx.object(balanceManager),         // balance_manager: BalanceManager
                        proof,                             // trade_proof: TradeProof
                        tx.pure.u64(clientOrderId),       // client_order_id: u64
                        tx.pure.u8(orderTypeValue),        // order_type: u8
                        tx.pure.u8(selfMatchingOption),    // self_matching_option: u8
                        tx.pure.u64(scaledPrice),          // price: u64
                        tx.pure.u64(scaledQuantity),       // quantity: u64 (must be scaled)
                        tx.pure.bool(isBid),               // is_bid: bool
                        tx.pure.bool(payWithDeep),          // pay_with_deep: bool
                        tx.pure.u64(expireTimestamp),       // expire_timestamp: u64
                        tx.object.clock(),                  // clock: Clock
                    ],
                })

            } else {
                const packageId = getDeepBookPackageId(network);
                const typeArguments = getTypeArgumentsForPool(network, poolInfo);

                // Generate trade proof
                const [proof] = tx.moveCall({
                    target: `${packageId}::balance_manager::generate_proof_as_owner`,
                    arguments: [tx.object(balanceManager)],
                });

                // Quantity scaling: quantity * baseCoin.scalar
                const baseCoinScalar = Math.pow(10, poolInfo.baseAssetDecimals);
                const scaledQuantity = Math.round(sizeNum * baseCoinScalar);

                // Generate client order ID (use timestamp)
                const clientOrderId = BigInt(Date.now());

                // Self matching option: 0 = SELF_MATCHING_ALLOWED, 1 = CANCEL_TAKER, 2 = CANCEL_MAKER
                const selfMatchingOption = 0; // SELF_MATCHING_ALLOWED

                // Pay with DEEP (true = use DEEP token, false = use base/quote assets)
                const payWithDeep = false;

                // Is bid: true for buy orders, false for sell orders
                const isBid = side === 'buy';

                tx.moveCall({
                    target: `${packageId}::pool::place_market_order`,
                    typeArguments,
                    arguments: [
                        tx.object(poolInfo.poolId),        // self: Pool
                        tx.object(balanceManager),         // balance_manager: BalanceManager
                        proof,                             // trade_proof: TradeProof
                        tx.pure.u64(clientOrderId),       // client_order_id: u64
                        tx.pure.u8(selfMatchingOption),   // self_matching_option: u8
                        tx.pure.u64(scaledQuantity),      // quantity: u64 (must be scaled)
                        tx.pure.bool(isBid),              // is_bid: bool
                        tx.pure.bool(payWithDeep),        // pay_with_deep: bool
                        tx.object.clock(),                // clock: Clock
                    ],
                });
            }

            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            if (result.$kind === 'FailedTransaction') {
                throw new Error('Transaction failed');
            }

            console.log('Order placed successfully:', result);
            const orderTypeLabel = orderType === 'limit' ? 'Limit' : 'Market';
            const sideLabel = side === 'buy' ? 'Buy' : 'Sell';
            toast.success(`${orderTypeLabel} order placed`, {
                description: `${sideLabel} ${size} ${baseSymbol} at ${orderType === 'limit' ? `$${price}` : 'market price'}`,
                duration: 5000,
            });

            // Clear form
            setSize('');
            if (orderType === 'market') {
                setPrice(currentPrice.toString());
            }

            // Refresh BalanceManager to update balances
            setTimeout(async () => {
                const network = currentNetwork as 'mainnet' | 'testnet' | 'devnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                if (bm) {
                    const balance = Number(await getBalanceForCoin(client, currentAccount.address, bm, '0x2::sui::SUI', network)) / 1_000_000_000;
                    setBalance(balance);
                }
                setBalanceManager(bm);
            }, 2000);
        } catch (error) {
            console.error('Order placement failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Order placement failed', {
                description: errorMessage,
                duration: 5000,
            });
        } finally {
            setIsPlacingOrder(false);
        }
    };

    return (
        <div className="flex flex-col h-full justify-between bg-background border-l overflow-y-auto">


            {/* Trading Section */}
            <div className="p-4 space-y-4">
                {/* Order type tabs */}
                <div className="flex w-full text-xs border-b border-muted">
                    <button
                        onClick={() => setOrderType('market')}
                        className={cn(`flex-1 py-2 font-medium transition-colors border-b-2 ${orderType === 'market'
                            ? '!border-primary text-primary -mb-[4px]'
                            : '!border-transparent text-muted-foreground hover:text-foreground'
                            }`)}
                    >
                        Market
                    </button>
                    <button
                        onClick={() => setOrderType('limit')}
                        className={cn(`flex-1 py-2 font-medium transition-colors border-b-2 ${orderType === 'limit'
                            ? '!border-primary text-primary -mb-[4px]'
                            : '!border-transparent text-muted-foreground hover:text-foreground'
                            }`)}
                    >
                        Limit
                    </button>
                </div>
                <div className="flex rounded-md bg-muted p-1">
                    <button
                        onClick={() => setSide('buy')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${side === 'buy' ? 'bg-green-500 text-white shadow' : 'hover:text-foreground/80'
                            }`}
                    >
                        Buy
                    </button>
                    <button
                        onClick={() => setSide('sell')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${side === 'sell' ? 'bg-red-500 text-white shadow' : 'hover:text-foreground/80'
                            }`}
                    >
                        Sell
                    </button>
                </div>



                <div className="space-y-4 pt-2">
                    {orderType === 'limit' && (
                        <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground uppercase font-bold">Price ({quoteSymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full bg-muted/50 border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="0.0000"
                                />
                                <button
                                    onClick={() => setPrice(currentPrice.toString())}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline"
                                >
                                    Market
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground uppercase font-bold">Size ({baseSymbol})</label>
                        <input
                            type="number"
                            min={10}
                            value={size}
                            onChange={(e) => setSize(e.target.value)}
                            className="w-full bg-muted/50 border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                        {['25%', '50%', '75%', '100%'].map((pct) => (
                            <button key={pct} className="text-[10px] py-1 bg-muted rounded hover:bg-muted/80 text-muted-foreground">
                                {pct}
                            </button>
                        ))}
                    </div>

                    <div className="pt-4 space-y-2">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Available</span>
                            <span>
                                {(
                                    side === 'buy'
                                        ? quoteBalance ?? 0
                                        : baseBalance ?? 0
                                ).toFixed(4)}{' '}
                                {side === 'buy' ? quoteSymbol : baseSymbol}
                            </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Order Value</span>
                            <span>{(parseFloat(price || '0') * parseFloat(size || '0')).toFixed(2)} {quoteSymbol}</span>
                        </div>
                    </div>

                    {currentAccount ? (
                        <Button
                            onClick={handlePlaceOrder}
                            disabled={isPlacingOrder || !poolInfo || !balanceManager || !size || (orderType === 'limit' && !price)}
                            className={`w-full font-bold uppercase ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            {isPlacingOrder ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                `${side === 'buy' ? 'Buy / Long' : 'Sell / Short'} `
                            )}
                        </Button>
                    ) : (
                        <div className="w-full [&>button]:w-full [&>button]:font-bold [&>button]:uppercase">
                            <ConnectButton />
                        </div>
                    )}
                </div>
            </div>

            {/* BalanceManager Section */}
            {currentAccount && (
                <div className="p-4 border-t bg-muted/30 space-y-3 mb-8">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Balance Manager</h3>
                        {isLoadingBalanceManager && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                    </div>

                    {balanceManager ? (
                        <div className="space-y-3">
                            <div className="text-[10px] text-muted-foreground font-mono truncate">
                                ID: {balanceManager.slice(0, 8)}...{balanceManager.slice(-6)}
                            </div>

                            {/* Deposit Section */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                                    <ArrowDownToLine className="h-3 w-3" />
                                    Deposit SUI
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        className="flex-1 bg-background border rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="0.00"
                                        disabled={isDepositing}
                                    />
                                    <Button
                                        onClick={handleDeposit}
                                        disabled={!depositAmount || isDepositing}
                                        className="px-3 py-1.5 text-xs h-auto"
                                        size="sm"
                                    >
                                        {isDepositing ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            'Deposit'
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Withdraw Section */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                                    <ArrowUpFromLine className="h-3 w-3" />
                                    Withdraw SUI
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        className="flex-1 bg-background border rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="0.00"
                                        disabled={isWithdrawing}
                                    />
                                    <Button
                                        onClick={handleWithdraw}
                                        disabled={!withdrawAmount || isWithdrawing}
                                        className="px-3 py-1.5 text-xs h-auto"
                                        size="sm"
                                        variant="outline"
                                    >
                                        {isWithdrawing ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            'Withdraw'
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Balance Display */}
                            <div className="pt-2 border-t">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">
                                    Available Balance
                                </div>
                                <div className="text-sm font-mono">
                                    {balance
                                    }
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                                No BalanceManager found. Deposit to create one.
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                                    <ArrowDownToLine className="h-3 w-3" />
                                    Initial Deposit (SUI)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        className="flex-1 bg-background border rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="0.00"
                                        disabled={isDepositing}
                                    />
                                    <Button
                                        onClick={handleDeposit}
                                        disabled={!depositAmount || isDepositing}
                                        className="px-3 py-1.5 text-xs h-auto"
                                        size="sm"
                                    >
                                        {isDepositing ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            'Create & Deposit'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
