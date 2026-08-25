"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { formatMoney } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

// Explicit, user-initiated exit from a position, separate from the
// threshold/trailing-stop automation.
export function SellNowModal({
  item,
  lastPrice,
  marketOpen,
  onClose,
  onSold,
}: {
  item: WatchlistItem;
  lastPrice?: number;
  marketOpen: boolean | null;
  onClose: () => void;
  onSold: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSell() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/watchlist/${item.id}/sell`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not place the sell order");
      return;
    }
    onSold();
  }

  const estimate = lastPrice !== undefined ? lastPrice * item.qty : null;

  return (
    <Modal title={`Sell ${item.symbol}?`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm">
          <p>
            Sell all <strong>{item.qty} shares</strong> of {item.symbol} now, at
            the current market price.
          </p>
          {lastPrice !== undefined && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Last price {formatMoney(lastPrice)} — roughly{" "}
              {estimate !== null ? formatMoney(estimate) : "—"} before fees. The
              actual fill price may differ slightly.
            </p>
          )}
        </div>

        {marketOpen === false && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            The market is closed right now. The order will be submitted but
            won&apos;t fill until the market next opens, and the price by then may
            be different.
          </div>
        )}

        <p className="text-sm text-zinc-500">
          This stays on your watchlist afterwards and will keep watching your buy
          threshold, unless you pause or remove it.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSell}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {busy ? "Placing order..." : `Sell ${item.qty} shares`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
