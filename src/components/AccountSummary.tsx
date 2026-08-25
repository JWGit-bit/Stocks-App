"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

interface AccountData {
  mode: "paper" | "live";
  cash: number;
  equity: number;
  buyingPower: number;
  portfolioValue: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
}

function pnlClass(value: number): string {
  if (value > 0) return "text-green-700 dark:text-green-500";
  if (value < 0) return "text-red-600";
  return "text-zinc-500";
}

function formatPnl(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

export function AccountSummary() {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json as AccountData);
      })
      .catch(() => !cancelled && setError("Could not load account info"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null; // most likely just "connect Alpaca keys" - don't nag on the dashboard
  if (!data) {
    return <div className="h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />;
  }

  const totalPnl = data.totalRealizedPnl + data.totalUnrealizedPnl;

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md border border-zinc-200 p-4 sm:grid-cols-4 dark:border-zinc-800">
      <div>
        <div className="text-xs text-zinc-500">Portfolio value</div>
        <div className="text-lg font-medium">{formatMoney(data.portfolioValue)}</div>
      </div>
      <div>
        <div className="text-xs text-zinc-500">Cash</div>
        <div className="text-lg font-medium">{formatMoney(data.cash)}</div>
      </div>
      <div>
        <div className="text-xs text-zinc-500">Realized P/L</div>
        <div className={`text-lg font-medium ${pnlClass(data.totalRealizedPnl)}`}>
          {formatPnl(data.totalRealizedPnl)}
        </div>
      </div>
      <div>
        <div className="text-xs text-zinc-500">Total P/L (incl. open positions)</div>
        <div className={`text-lg font-medium ${pnlClass(totalPnl)}`}>{formatPnl(totalPnl)}</div>
      </div>
    </div>
  );
}
