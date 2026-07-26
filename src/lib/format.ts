import type { WatchlistStatus } from "@/lib/types";

const STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching_buy: "Watching (buy)",
  pending_buy: "Buying...",
  holding: "Holding",
  pending_sell: "Selling...",
};

export function statusLabel(status: WatchlistStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
