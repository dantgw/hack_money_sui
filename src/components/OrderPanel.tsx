import { useState, useEffect } from 'react';
import { useCurrentAccount, ConnectButton, useCurrentClient, useDAppKit, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { Button } from './ui/button';
import { getDeepBookPackageId, getBalanceManager, getRegistryId, getBalanceForCoin } from '../lib/deepbook';
import { Loader2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

interface OrderPanelProps {
    poolName: string;
    currentPrice: number;
}

export function OrderPanel({ poolName, currentPrice }: OrderPanelProps) {
    const currentAccount = useCurrentAccount();
    const client = useCurrentClient();
    const dAppKit = useDAppKit();
    const currentNetwork = useCurrentNetwork();

    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
    const [price, setPrice] = useState(currentPrice.toString());
    const [size, setSize] = useState('');

    // BalanceManager state
    const [balanceManager, setBalanceManager] = useState<string | null>(null);
    const [balance, setBalance] = useState<number | null>(0);

    const [isLoadingBalanceManager, setIsLoadingBalanceManager] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    const [baseSymbol, quoteSymbol] = poolName.split('_');

    // Fetch BalanceManager when account changes
    useEffect(() => {
        const fetchBalanceManager = async () => {
            if (!currentAccount?.address) {
                setBalanceManager(null);
                return;
            }

            setIsLoadingBalanceManager(true);
            try {
                const network = currentNetwork as 'mainnet' | 'testnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                let balance = 0;
                if (bm) {
                    balance = Number(await getBalanceForCoin(client, currentAccount.address, bm, '0x2::sui::SUI', network)) / 1_000_000_000;

                }
                setBalanceManager(bm);
                setBalance(balance);
            } catch (error) {
                console.error('Error fetching BalanceManager:', error);
                setBalanceManager(null);
            } finally {
                setIsLoadingBalanceManager(false);
            }
        };

        fetchBalanceManager();
        // Refresh every 10 seconds
        const interval = setInterval(fetchBalanceManager, 10000);
        return () => clearInterval(interval);
    }, [currentAccount?.address, client, currentNetwork]);

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

            // Refresh BalanceManager
            setTimeout(async () => {
                const network = currentNetwork as 'mainnet' | 'testnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                setBalanceManager(bm);
            }, 2000);
        } catch (error) {
            console.error('Deposit failed:', error);
            alert(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

            // Refresh BalanceManager
            setTimeout(async () => {
                const network = currentNetwork as 'mainnet' | 'testnet';
                const bm = await getBalanceManager(client, currentAccount.address, network);
                setBalanceManager(bm);
            }, 2000);
        } catch (error) {
            console.error('Withdrawal failed:', error);
            alert(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsWithdrawing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background border-l overflow-y-auto">
            {/* BalanceManager Section */}
            {currentAccount && (
                <div className="p-4 border-b bg-muted/30 space-y-3">
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

            {/* Trading Section */}
            <div className="p-4 space-y-4">
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

                <div className="flex space-x-2 text-xs">
                    <button
                        onClick={() => setOrderType('limit')}
                        className={`px-3 py-1 rounded-full border ${orderType === 'limit' ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}
                    >
                        Limit
                    </button>
                    <button
                        onClick={() => setOrderType('market')}
                        className={`px-3 py-1 rounded-full border ${orderType === 'market' ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}
                    >
                        Market
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
                            <span>0.00 {side === 'buy' ? quoteSymbol : baseSymbol}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Order Value</span>
                            <span>{(parseFloat(price || '0') * parseFloat(size || '0')).toFixed(2)} {quoteSymbol}</span>
                        </div>
                    </div>

                    {currentAccount ? (
                        <Button className={`w-full font-bold uppercase ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            {side === 'buy' ? 'Long' : 'Short'} {baseSymbol}
                        </Button>
                    ) : (
                        <div className="w-full [&>button]:w-full [&>button]:font-bold [&>button]:uppercase">
                            <ConnectButton />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
