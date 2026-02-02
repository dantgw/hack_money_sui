import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react";
import { isValidSuiObjectId } from "@mysten/sui/utils";
import { useState } from "react";
import { Counter } from "./Counter";
import { CreateCounter } from "./CreateCounter";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Wallet, TrendingUp } from "lucide-react";
import { DeepBookTrading } from "./components/DeepBookTrading";

function App() {
  const currentAccount = useCurrentAccount();
  const [counterId, setCounter] = useState(() => {
    const hash = window.location.hash.slice(1);
    return isValidSuiObjectId(hash) ? hash : null;
  });
  const [activeView, setActiveView] = useState<'counter' | 'trading'>('trading');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">Sui dApp</h1>
            <nav className="flex gap-2">
              <button
                onClick={() => setActiveView('trading')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeView === 'trading'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                  }`}
              >
                <TrendingUp className="inline h-4 w-4 mr-1" />
                Trading
              </button>
              <button
                onClick={() => setActiveView('counter')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeView === 'counter'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                  }`}
              >
                Counter
              </button>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeView === 'trading' ? (
          <div className="mx-auto max-w-6xl">
            <DeepBookTrading />
          </div>
        ) : (
          <div className="mx-auto max-w-md">
            {currentAccount ? (
              counterId ? (
                <Counter id={counterId} />
              ) : (
                <CreateCounter
                  onCreated={(id) => {
                    window.location.hash = id;
                    setCounter(id);
                  }}
                />
              )
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Connect Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Connect your wallet to create and interact with counters on
                    the Sui blockchain.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
