"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PriceChart } from "@/components/PriceChart";
import { formatMoney } from "@/lib/format";
import type { Trade, WatchlistItem } from "@/lib/types";
import type { Bar } from "@/lib/alpaca/marketData";

export function StockHistoryModal({
  item,
  onClose,
}: {
  item: WatchlistItem;
  onClose: () => void;
}) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trades?watchlistItemId=${item.id}`)
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
  }, [item.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${item.symbol}/history`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setChartError(json.error);
        else setBars(json.bars as Bar[]);
      })
      .catch(() => !cancelled && setChartError("Failed to load price history"));
    return () => {
      cancelled = true;
    };
  }, [item.symbol]);

  return (
    <Modal title={`${item.symbol} history`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          {chartError && <p className="text-sm text-red-600">{chartError}</p>}
          {!chartError && bars === null && (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
              Loading chart...
            </div>
          )}
          {!chartError && bars && bars.length === 0 && (
            <p className="text-sm text-zinc-500">No price history available.</p>
          )}
          {!chartError && bars && bars.length > 0 && <PriceChart bars={bars} />}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Trade history</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!error && trades === null && (
            <p className="text-sm text-zinc-500">Loading...</p>
          )}
          {trades && trades.length === 0 && (
            <p className="text-sm text-zinc-500">
              No trades yet for this ticker.
            </p>
          )}
          {trades && trades.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-2">Date</th>
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
                    <td className="py-1 pr-2 capitalize">{t.side}</td>
                    <td className="py-1 pr-2">{t.qty}</td>
                    <td className="py-1 pr-2">
                      {t.filled_avg_price ?? "—"}
                    </td>
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
          )}
        </div>
      </div>
    </Modal>
  );
}
