import type { WatchlistItem } from "@/lib/types";

export type TradeAction = "buy" | "sell" | "none";

// The one place that turns a price + a watchlist item's thresholds into a
// trade decision. Only acts from the "resting" states (watching_buy,
// holding) - pending_buy/pending_sell items are mid-order and are handled by
// reconciliation instead, never by this function.
export function decideAction(item: WatchlistItem, currentPrice: number): TradeAction {
  if (item.status === "watching_buy" && item.buy_at_or_below !== null) {
    if (currentPrice <= item.buy_at_or_below) return "buy";
  }
  if (item.status === "holding" && item.sell_at_or_above !== null) {
    if (currentPrice >= item.sell_at_or_above) return "sell";
  }
  return "none";
}

// Marketable limit order buffer: past the current price by this fraction so
// the order fills like a market order would, while still capping slippage.
const LIMIT_PRICE_BUFFER = 0.002;

export function limitPriceFor(action: "buy" | "sell", currentPrice: number): number {
  const factor = action === "buy" ? 1 + LIMIT_PRICE_BUFFER : 1 - LIMIT_PRICE_BUFFER;
  return Math.round(currentPrice * factor * 100) / 100;
}
