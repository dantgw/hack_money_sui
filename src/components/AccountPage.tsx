import { ConnectButton, useCurrentAccount, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { NETWORK_STORAGE_KEY } from "../dApp-kit";
import { Wallet, Wifi, ChevronRight } from "lucide-react";

export function AccountPage() {
  const currentAccount = useCurrentAccount();
  const currentNetwork = useCurrentNetwork();
  const dAppKit = useDAppKit();

  const toggleNetwork = () => {
    const newNetwork = currentNetwork === "mainnet" ? "testnet" : "mainnet";
    window.localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    dAppKit.switchNetwork(newNetwork);
  };

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full">
        <div>
          <h2 className="text-xl font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your wallet and network settings
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Wallet
            </CardTitle>
            <CardDescription>
              Connect your wallet to trade on Varuna
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="[&>button]:w-full [&>button]:justify-center [&>button]:min-h-[48px]">
              <ConnectButton />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Network
            </CardTitle>
            <CardDescription>
              Switch between Mainnet and Testnet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full justify-between min-h-[48px]"
              onClick={toggleNetwork}
            >
              <span>{currentNetwork === "mainnet" ? "Mainnet" : "Testnet"}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {currentAccount && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Connected</CardTitle>
              <CardDescription className="font-mono text-xs break-all">
                {currentAccount.address}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
