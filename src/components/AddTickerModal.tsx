"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { WatchlistItem } from "@/lib/types";

export function AddTickerModal({
  existingItem,
  onClose,
  onSaved,
}: {
  existingItem?: WatchlistItem;
  onClose: () => void;
  onSaved: (item: WatchlistItem) => void;
}) {
  const [symbol, setSymbol] = useState(existingItem?.symbol ?? "");
  const [buyAtOrBelow, setBuyAtOrBelow] = useState(
    existingItem?.buy_at_or_below?.toString() ?? "",
  );
  const [sellAtOrAbove, setSellAtOrAbove] = useState(
    existingItem?.sell_at_or_above?.toString() ?? "",
  );
  const [qty, setQty] = useState(existingItem?.qty?.toString() ?? "1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      symbol,
      buyAtOrBelow: buyAtOrBelow === "" ? null : Number(buyAtOrBelow),
      sellAtOrAbove: sellAtOrAbove === "" ? null : Number(sellAtOrAbove),
      qty: Number(qty),
    };

    const res = await fetch(
      existingItem ? `/api/watchlist/${existingItem.id}` : "/api/watchlist",
      {
        method: existingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    setSaving(false);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return;
    }
    onSaved(json.item as WatchlistItem);
  }

  return (
    <Modal title={existingItem ? `Edit ${existingItem.symbol}` : "Add a ticker"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="symbol" className="text-sm font-medium">
            Symbol
          </label>
          <input
            id="symbol"
            required
            disabled={!!existingItem}
            placeholder="AAPL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="buy" className="text-sm font-medium">
              Buy at/below ($)
            </label>
            <input
              id="buy"
              type="number"
              step="0.01"
              min="0"
              placeholder="optional"
              value={buyAtOrBelow}
              onChange={(e) => setBuyAtOrBelow(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sell" className="text-sm font-medium">
              Sell at/above ($)
            </label>
            <input
              id="sell"
              type="number"
              step="0.01"
              min="0"
              placeholder="optional"
              value={sellAtOrAbove}
              onChange={(e) => setSellAtOrAbove(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qty" className="text-sm font-medium">
            Quantity (shares per trade)
          </label>
          <input
            id="qty"
            type="number"
            step="1"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {saving ? "Saving..." : existingItem ? "Save changes" : "Add to watchlist"}
        </button>
      </form>
    </Modal>
  );
}
