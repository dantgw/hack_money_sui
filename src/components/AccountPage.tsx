import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { NETWORK_STORAGE_KEY } from "../dApp-kit";
import { Wallet, Wifi, ChevronRight, TrendingUp, TrendingDown, Copy, Coins } from "lucide-react";
import { PortfolioChart } from "./PortfolioChart";
import { AnimatedNumber } from "./AnimatedNumber";
import { getBalanceManager, getBalanceForCoin } from "../lib/deepbook";
import { toast } from "sonner";

// Simulated portfolio metrics for demo (no real trading history)
const SIMULATED_PORTFOLIO = {
  totalValue: 8033.51,
  dailyChange: 11.63,
  dailyChangePercent: 0.14,
  buyingPower: 7011.36,
};

export function AccountPage() {
  const currentAccount = useCurrentAccount();
  const currentNetwork = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const client = useCurrentClient();

  const [balanceManager, setBalanceManager] = useState<string | null>(null);
  const [balanceManagerBalance, setBalanceManagerBalance] = useState<number | null>(null);
  const [isLoadingBalanceManager, setIsLoadingBalanceManager] = useState(false);

  useEffect(() => {
    const fetchBalanceManager = async () => {
      if (!currentAccount?.address) {
        setBalanceManager(null);
        setBalanceManagerBalance(null);
        return;
      }

      setIsLoadingBalanceManager(true);
      try {
        const network = currentNetwork as "mainnet" | "testnet" | "devnet";
        const bm = await getBalanceManager(client, currentAccount.address, network);

        if (bm) {
          const rawBalance = await getBalanceForCoin(
            client,
            currentAccount.address,
            bm,
            "0x2::sui::SUI",
            network,
          );
          setBalanceManager(bm);
          setBalanceManagerBalance(Number(rawBalance) / 1_000_000_000);
        } else {
          setBalanceManager(null);
          setBalanceManagerBalance(null);
        }
      } catch (error) {
        console.error("Error fetching BalanceManager:", error);
        setBalanceManager(null);
        setBalanceManagerBalance(null);
      } finally {
        setIsLoadingBalanceManager(false);
      }
    };

    fetchBalanceManager();
  }, [currentAccount?.address, client, currentNetwork]);

  const toggleNetwork = () => {
    const newNetwork = currentNetwork === "mainnet" ? "testnet" : "mainnet";
    window.localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    dAppKit.switchNetwork(newNetwork);
  };

  const { totalValue, dailyChange, dailyChangePercent } = SIMULATED_PORTFOLIO;
  const isPositive = dailyChange >= 0;

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-xl lg:max-w-6xl xl:max-w-7xl mx-auto w-full">
        {/* Hero: Account value + daily change (Robinhood-style) */}
        <div className="pt-2 lg:pt-4">
          <h2 className="text-xl lg:text-2xl font-semibold animate-count-up opacity-0 [animation-fill-mode:forwards]">Simulated Account</h2>


          <div className="mt-6 lg:mt-8 animate-count-up opacity-0 [animation-fill-mode:forwards] [animation-delay:200ms]">
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums">
              <AnimatedNumber value={totalValue} prefix="$" duration={1000} />
            </div>
            <div
              className={`mt-1 flex items-center gap-1 text-sm font-medium ${isPositive ? "text-emerald-500" : "text-red-500"
                }`}
            >
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>
                <AnimatedNumber
                  value={dailyChange}
                  prefix={isPositive ? "▲ $" : "▼ $"}
                  decimals={2}
                  duration={800}
                />
                {" "}(<AnimatedNumber value={dailyChangePercent} suffix="%)" decimals={2} duration={800} />
                {" "}Today
              </span>
            </div>
          </div>
        </div>

        {/* Chart then settings — same order on mobile and desktop */}
        <div>
          {/* Trading history graph with timeframe selector */}
          <Card className="overflow-hidden border-0 bg-card/50">
            <CardContent className="pt-6 lg:pt-8 px-4 sm:px-6 lg:px-0">
              <PortfolioChart
                totalValue={totalValue}
                dailyChange={dailyChange}
                dailyChangePercent={dailyChangePercent}
              />
            </CardContent>
          </Card>

          {/* Settings: compact list below chart */}
          <div className="pt-2">
            <h3 className="text-sm font-medium text-muted-foreground px-1 mb-3">Settings</h3>

            <div className="rounded-xl border bg-card/30">
              {/* Wallet */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-3 min-w-0">
                  <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Wallet</div>
                    <div className="text-xs text-muted-foreground">Connect to trade on Varuna</div>
                  </div>
                </div>
                <div className="shrink-0 scale-90 origin-right">
                  <ConnectButton>Connect</ConnectButton>
                </div>
              </div>

              {/* BalanceManager address & balance (when connected) */}
              {currentAccount && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">BalanceManager</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {isLoadingBalanceManager ? (
                          "Loading…"
                        ) : balanceManager ? (
                          <>
                            <span className="font-mono">{balanceManager.slice(0, 8)}…{balanceManager.slice(-6)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(balanceManager);
                                toast.success("BalanceManager address copied");
                              }}
                              className="hover:text-foreground transition-colors"
                              title="Copy address"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          "None yet — deposit to create"
                        )}
                      </div>
                    </div>
                  </div>
                  {balanceManager && balanceManagerBalance !== null && (
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      {balanceManagerBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI
                    </span>
                  )}
                </div>
              )}

              {/* Network */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Wifi className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Network</div>
                    <div className="text-xs text-muted-foreground">Mainnet or Testnet</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={toggleNetwork}
                >
                  {currentNetwork === "mainnet" ? "Mainnet" : "Testnet"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {currentAccount && (
              <Card className="mt-4 rounded-xl border bg-card/30 ">
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Connected wallet</div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(currentAccount.address);
                          toast.success("Wallet address copied");
                        }}
                        className="font-mono text-xs text-left text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mt-0.5"
                        title="Copy full address"
                      >
                        {currentAccount.address.slice(0, 8)}…{currentAccount.address.slice(-6)}
                        <Copy className="h-3 w-3 shrink-0" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
