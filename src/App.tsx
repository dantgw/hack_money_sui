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

          <ConnectButton />

        </div>
      </header>


      <main className={"h-screen"}>

        <DeepBookTrading />

      </main>
    </div>
  );
}

export default App;
