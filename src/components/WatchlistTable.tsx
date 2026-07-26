"use client";

import { useState } from "react";
import { AddTickerModal } from "@/components/AddTickerModal";
import { StockHistoryModal } from "@/components/StockHistoryModal";
import { statusLabel, formatMoney } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

export function WatchlistTable({ initialItems }: { initialItems: WatchlistItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [historyItem, setHistoryItem] = useState<WatchlistItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [checkingPrices, setCheckingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [runningTrades, setRunningTrades] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function handleRunTradingCheck() {
    setRunningTrades(true);
    setRunResult(null);
    setRunError(null);
    const res = await fetch("/api/trading/run-check", { method: "POST" });
    const json = await res.json();
    setRunningTrades(false);
    if (!res.ok || json.error) {
      setRunError(json.error ?? "Trading check failed");
      return;
    }
    setRunResult(
      json.actionsTaken > 0
        ? `${json.actionsTaken} order${json.actionsTaken === 1 ? "" : "s"} placed.`
        : "No thresholds crossed - nothing to do.",
    );
    const refreshed = await fetch("/api/watchlist");
    const refreshedJson = await refreshed.json();
    if (refreshed.ok) setItems(refreshedJson.items as WatchlistItem[]);
  }

  async function handleCheckPrices() {
    if (items.length === 0) return;
    setCheckingPrices(true);
    setPriceError(null);
    const symbols = items.map((i) => i.symbol).join(",");
    const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
    const json = await res.json();
    setCheckingPrices(false);
    if (!res.ok) {
      setPriceError(json.error ?? "Could not fetch prices");
      return;
    }
    const next: Record<string, number> = {};
    for (const p of json.prices as { symbol: string; price: number }[]) {
      next[p.symbol] = p.price;
    }
    setPrices(next);
  }

  function handleSaved(item: WatchlistItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item];
    });
    setShowAddModal(false);
    setEditingItem(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this ticker from your watchlist? This does not sell any shares you may already hold.")) {
      return;
    }
    setDeletingId(id);
    const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your watchlist</h1>
        <div className="flex gap-3">
          <button
            onClick={handleCheckPrices}
            disabled={checkingPrices || items.length === 0}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            {checkingPrices ? "Checking..." : "Check prices now"}
          </button>
          <button
            onClick={handleRunTradingCheck}
            disabled={runningTrades || items.length === 0}
            title="Places a paper order for any item whose buy/sell threshold has been crossed"
            className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50 dark:border-blue-800 dark:text-blue-400"
          >
            {runningTrades ? "Running..." : "Run trading check"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Add ticker
          </button>
        </div>
      </div>

      {priceError && <p className="text-sm text-red-600">{priceError}</p>}
      {runError && <p className="text-sm text-red-600">{runError}</p>}
      {runResult && <p className="text-sm text-green-700 dark:text-green-500">{runResult}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No tickers yet. Add one to start setting buy/sell thresholds.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Last price</th>
                <th className="px-4 py-2">Buy at/below</th>
                <th className="px-4 py-2">Sell at/above</th>
                <th className="px-4 py-2">Qty</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setHistoryItem(item)}
                  className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-2 font-medium">{item.symbol}</td>
                  <td className="px-4 py-2">
                    {prices[item.symbol] !== undefined
                      ? formatMoney(prices[item.symbol])
                      : "—"}
                  </td>
                  <td className="px-4 py-2">{formatMoney(item.buy_at_or_below)}</td>
                  <td className="px-4 py-2">{formatMoney(item.sell_at_or_above)}</td>
                  <td className="px-4 py-2">{item.qty}</td>
                  <td className="px-4 py-2">{statusLabel(item.status)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem(item);
                      }}
                      className="mr-3 text-zinc-600 hover:underline dark:text-zinc-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      disabled={deletingId === item.id}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddTickerModal onClose={() => setShowAddModal(false)} onSaved={handleSaved} />
      )}
      {editingItem && (
        <AddTickerModal
          existingItem={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
      {historyItem && (
        <StockHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </div>
  );
}
