import { ConnectButton, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import { TrendingUp } from "lucide-react";
import { DeepBookTrading } from "./components/DeepBookTrading";
import { Button } from "./components/ui/button";
import { Toaster } from "sonner";
import { NETWORK_STORAGE_KEY } from "./dApp-kit";

function App() {
  const currentNetwork = useCurrentNetwork();
  const dAppKit = useDAppKit();

  const toggleNetwork = () => {
    const newNetwork = currentNetwork === "mainnet" ? "testnet" : "mainnet";
    window.localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    dAppKit.switchNetwork(newNetwork);
  };

  return (
    <div className="min-h-screen">

      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="w-full flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">Varuna</h1>
            <nav className="flex gap-2">

              <TrendingUp className="inline h-4 w-4 mr-1" />
              DeepBook


            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleNetwork}
              className="font-medium"
            >
              {currentNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}
            </Button>
            <ConnectButton />
          </div>

        </div>
      </header>


      <main className={"h-screen"}>

        <DeepBookTrading />

      </main>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          },
        }}
      />
    </div>
  );
}

export default App;
