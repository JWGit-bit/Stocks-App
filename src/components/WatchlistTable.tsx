"use client";

import { useState } from "react";
import { AddTickerModal } from "@/components/AddTickerModal";
import { StockHistoryModal } from "@/components/StockHistoryModal";
import { AllHistoryModal } from "@/components/AllHistoryModal";
import { RemoveTickerModal } from "@/components/RemoveTickerModal";
import { SellNowModal } from "@/components/SellNowModal";
import { statusLabel, formatMoney } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

export function WatchlistTable({
  initialItems,
  marketOpen = null,
}: {
  initialItems: WatchlistItem[];
  marketOpen?: boolean | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [historyItem, setHistoryItem] = useState<WatchlistItem | null>(null);
  const [removingItem, setRemovingItem] = useState<WatchlistItem | null>(null);
  const [sellingItem, setSellingItem] = useState<WatchlistItem | null>(null);
  const [togglingPauseId, setTogglingPauseId] = useState<string | null>(null);
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
    await refreshItems();
  }

  async function handleCheckPrices() {
    if (items.length === 0) return;
    setCheckingPrices(true);
    setPriceError(null);
    const symbols = items.map((i) => i.symbol).join(",");
    const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`, {
      cache: "no-store",
    });
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

  async function refreshItems() {
    const res = await fetch("/api/watchlist", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setItems(json.items as WatchlistItem[]);
  }

  async function handleTogglePause(item: WatchlistItem) {
    setTogglingPauseId(item.id);
    const res = await fetch(`/api/watchlist/${item.id}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !item.paused }),
    });
    setTogglingPauseId(null);
    if (res.ok) {
      const json = await res.json();
      setItems((prev) => prev.map((i) => (i.id === item.id ? (json.item as WatchlistItem) : i)));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Your watchlist</h1>
        <div className="flex flex-wrap gap-2">
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
            onClick={() => setShowAllHistory(true)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            History
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
        <>
          {/* Card list - small screens, no horizontal scrolling */}
          <div className="flex flex-col gap-3 sm:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => setHistoryItem(item)}
                className="cursor-pointer rounded-md border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.symbol}</span>
                  <span className="text-xs text-zinc-500">
                    {statusLabel(item.status)}
                    {item.paused && " · Paused"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  Last price:{" "}
                  {prices[item.symbol] !== undefined ? formatMoney(prices[item.symbol]) : "—"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                  <div>
                    <span className="text-zinc-500">Buy at/below </span>
                    {formatMoney(item.buy_at_or_below)}
                  </div>
                  <div>
                    <span className="text-zinc-500">Sell at/above </span>
                    {formatMoney(item.sell_at_or_above)}
                  </div>
                  <div>
                    <span className="text-zinc-500">Qty </span>
                    {item.qty}
                  </div>
                  {item.trail_percent !== null && (
                    <div>
                      <span className="text-zinc-500">Trailing stop </span>
                      {item.trail_percent}%
                    </div>
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-4 text-sm">
                  {item.status === "holding" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSellingItem(item);
                      }}
                      className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Sell
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePause(item);
                    }}
                    disabled={togglingPauseId === item.id}
                    className="text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
                  >
                    {item.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem(item);
                    }}
                    className="text-zinc-600 hover:underline dark:text-zinc-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemovingItem(item);
                    }}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Table - larger screens */}
          <div className="hidden overflow-x-auto rounded-md border border-zinc-200 sm:block dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-4 py-2">Last price</th>
                  <th className="px-4 py-2">Buy at/below</th>
                  <th className="px-4 py-2">Sell at/above</th>
                  <th className="px-4 py-2">Trail</th>
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
                    <td className="px-4 py-2">
                      {item.trail_percent !== null ? `${item.trail_percent}%` : "—"}
                    </td>
                    <td className="px-4 py-2">{item.qty}</td>
                    <td className="px-4 py-2">
                      {statusLabel(item.status)}
                      {item.paused && " · Paused"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.status === "holding" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSellingItem(item);
                          }}
                          className="mr-3 font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Sell
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePause(item);
                        }}
                        disabled={togglingPauseId === item.id}
                        className="mr-3 text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
                      >
                        {item.paused ? "Resume" : "Pause"}
                      </button>
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
                          setRemovingItem(item);
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
      {showAllHistory && <AllHistoryModal onClose={() => setShowAllHistory(false)} />}
      {sellingItem && (
        <SellNowModal
          item={sellingItem}
          lastPrice={prices[sellingItem.symbol]}
          marketOpen={marketOpen}
          onClose={() => setSellingItem(null)}
          onSold={async () => {
            setSellingItem(null);
            setRunResult(
              "Sell order placed. It'll show as sold once the fill comes back.",
            );
            await refreshItems();
          }}
        />
      )}
      {removingItem && (
        <RemoveTickerModal
          item={removingItem}
          onClose={() => setRemovingItem(null)}
          onRemoved={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setRemovingItem(null);
          }}
          onSold={async () => {
            setRemovingItem(null);
            setRunResult(
              "Sell order placed. It'll show as sold once the fill comes back.",
            );
            await refreshItems();
          }}
        />
      )}
    </div>
  );
}
