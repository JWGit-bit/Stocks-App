"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { formatMoney } from "@/lib/format";
import type { Trade } from "@/lib/types";

interface SymbolSummary {
  symbol: string;
  realizedPnl: number;
  tradeCount: number;
}

export function AllHistoryModal({ onClose }: { onClose: () => void }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trades")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setTrades(json.trades as Trade[]);
      })
      .catch(() => !cancelled && setError("Failed to load trade history"));
    return () => {
      cancelled = true;
    };
  }, []);

  const bySymbol = useMemo<SymbolSummary[]>(() => {
    if (!trades) return [];
    const map = new Map<string, SymbolSummary>();
    for (const t of trades) {
      const entry = map.get(t.symbol) ?? { symbol: t.symbol, realizedPnl: 0, tradeCount: 0 };
      entry.tradeCount += 1;
      if (t.realized_pnl !== null) entry.realizedPnl += Number(t.realized_pnl);
      map.set(t.symbol, entry);
    }
    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [trades]);

  return (
    <Modal title="All trade history" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && trades === null && <p className="text-sm text-zinc-500">Loading...</p>}

        {trades && trades.length === 0 && (
          <p className="text-sm text-zinc-500">No trades yet.</p>
        )}

        {trades && trades.length > 0 && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium">By stock (realized P/L)</h3>
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 pr-2">Symbol</th>
                    <th className="py-1 pr-2">Trades</th>
                    <th className="py-1">Realized P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {bySymbol.map((s) => (
                    <tr key={s.symbol} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="py-1 pr-2 font-medium">{s.symbol}</td>
                      <td className="py-1 pr-2">{s.tradeCount}</td>
                      <td
                        className={
                          s.realizedPnl === 0
                            ? "py-1"
                            : `py-1 ${s.realizedPnl > 0 ? "text-green-700 dark:text-green-500" : "text-red-600"}`
                        }
                      >
                        {s.realizedPnl > 0 ? "+" : ""}
                        {formatMoney(s.realizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">All fills</h3>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2">Date</th>
                      <th className="py-1 pr-2">Symbol</th>
                      <th className="py-1 pr-2">Side</th>
                      <th className="py-1 pr-2">Qty</th>
                      <th className="py-1 pr-2">Fill price</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="py-1 pr-2">
                          {new Date(t.submitted_at).toLocaleString()}
                        </td>
                        <td className="py-1 pr-2 font-medium">{t.symbol}</td>
                        <td className="py-1 pr-2 capitalize">{t.side}</td>
                        <td className="py-1 pr-2">{t.qty}</td>
                        <td className="py-1 pr-2">{t.filled_avg_price ?? "—"}</td>
                        <td className="py-1 pr-2">{t.status ?? "—"}</td>
                        <td
                          className={
                            t.realized_pnl === null
                              ? "py-1"
                              : `py-1 ${t.realized_pnl >= 0 ? "text-green-700 dark:text-green-500" : "text-red-600"}`
                          }
                        >
                          {t.realized_pnl === null
                            ? "—"
                            : `${t.realized_pnl >= 0 ? "+" : ""}${formatMoney(t.realized_pnl)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
