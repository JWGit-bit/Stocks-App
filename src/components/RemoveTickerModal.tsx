"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { WatchlistItem } from "@/lib/types";

// Removing a held ticker is the one action where the app's idea of "done"
// and the broker's differ: the watchlist row disappears but the shares stay.
// This spells that out and offers to actually close the position first.
export function RemoveTickerModal({
  item,
  onClose,
  onRemoved,
  onSold,
}: {
  item: WatchlistItem;
  onClose: () => void;
  onRemoved: (id: string) => void;
  onSold: () => void;
}) {
  const [busy, setBusy] = useState<null | "sell" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  const isHolding = item.status === "holding";

  async function handleRemoveOnly() {
    setBusy("remove");
    setError(null);
    const res = await fetch(`/api/watchlist/${item.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not remove this ticker");
      return;
    }
    onRemoved(item.id);
  }

  async function handleSellThenRemove() {
    setBusy("sell");
    setError(null);
    const sellRes = await fetch(`/api/watchlist/${item.id}/sell`, { method: "POST" });
    const sellJson = await sellRes.json().catch(() => ({}));
    if (!sellRes.ok) {
      setBusy(null);
      setError(sellJson.error ?? "Could not place the sell order");
      return;
    }
    setBusy(null);
    onSold();
  }

  return (
    <Modal title={`Remove ${item.symbol}?`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {isHolding ? (
          <>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium">You currently hold {item.qty} shares of {item.symbol}.</p>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                Removing it from the watchlist only stops the bot from tracking
                it — <strong>you will still own the shares</strong>, and nothing
                will be watching them to sell.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleSellThenRemove}
                disabled={busy !== null}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {busy === "sell"
                  ? "Placing sell order..."
                  : `Sell ${item.qty} shares now at market`}
              </button>
              <button
                onClick={handleRemoveOnly}
                disabled={busy !== null}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
              >
                {busy === "remove" ? "Removing..." : "Just stop tracking (keep the shares)"}
              </button>
              <button
                onClick={onClose}
                disabled={busy !== null}
                className="px-4 py-2 text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This stops watching {item.symbol}. You don&apos;t currently hold any
              shares of it, so nothing will be sold.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={busy !== null}
                className="px-4 py-2 text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveOnly}
                disabled={busy !== null}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "remove" ? "Removing..." : "Remove"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
