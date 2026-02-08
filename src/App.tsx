import { ConnectButton, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import { DeepBookTrading } from "./components/DeepBookTrading";
import { Button } from "./components/ui/button";
import { Toaster } from "sonner";
import { NETWORK_STORAGE_KEY } from "./dApp-kit";

import { Link, NavLink, Route, Routes } from "react-router-dom";
import logo from "./assets/logo.png";
import { OptionsPage } from "./components/OptionsPage";
import { AccountPage } from "./components/AccountPage";
import { TrendingUp, FileText, User } from "lucide-react";
import { cn } from "./lib/utils";

function App() {
  const currentNetwork = useCurrentNetwork();
  const dAppKit = useDAppKit();

  const toggleNetwork = () => {
    const newNetwork = currentNetwork === "mainnet" ? "testnet" : "mainnet";
    window.localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    dAppKit.switchNetwork(newNetwork);
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  const bottomTabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex flex-col items-center justify-center flex-1 py-2.5 min-h-[56px] gap-1 transition-colors touch-manipulation",
      isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
    );

  return (
    <div className="min-h-dvh min-h-screen flex flex-col bg-background">
      {/* Header — minimal on mobile, full nav on desktop */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="w-full flex h-12 sm:h-14 items-center justify-between px-3 sm:px-4 gap-2">
          {/* Left: Brand — always visible */}
          <Link to="/" className="shrink-0 flex items-center">
            <img src={logo} alt="Varuna" className="h-8 sm:h-9 w-auto" />
          </Link>

          {/* Center: Desktop nav (hidden on mobile — bottom tabs instead) */}
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink to="/" className={navLinkClass}>
              <TrendingUp className="h-4 w-4" />
              DeepBook
            </NavLink>
            <NavLink to="/options" className={navLinkClass}>
              <FileText className="h-4 w-4" />
              Options
            </NavLink>
          </nav>

          {/* Right: Wallet & network — compact on mobile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleNetwork}
              className="font-medium text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 shrink-0"
            >
              {currentNetwork === "mainnet" ? "Mainnet" : "Testnet"}
            </Button>
            <div className="hidden lg:block [&_button]:h-8 [&_button]:text-xs sm:[&_button]:h-9 sm:[&_button]:text-sm">
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main content — room for bottom tab bar on mobile */}
      <main className="flex-1 min-h-0 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<DeepBookTrading />} />
            <Route path="/options" element={<OptionsPage />} />
            <Route path="/account" element={<AccountPage />} />
          </Routes>
        </div>
      </main>

      {/* Bottom tab bar — mobile only (Robinhood/Coinbase style) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch h-14">
          <NavLink to="/" className={bottomTabClass}>
            {({ isActive }) => (
              <>
                <TrendingUp className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-[11px] font-medium">Trade</span>
              </>
            )}
          </NavLink>
          <NavLink to="/options" className={bottomTabClass}>
            {({ isActive }) => (
              <>
                <FileText className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-[11px] font-medium">Options</span>
              </>
            )}
          </NavLink>
          <NavLink to="/account" className={bottomTabClass}>
            {({ isActive }) => (
              <>
                <User className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-[11px] font-medium">Account</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

      <Toaster
        position="bottom-right"
        richColors
        closeButton
      />
    </div>
  );
}

export default App;