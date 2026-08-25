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
  if (item.status === "holding") {
    if (item.sell_at_or_above !== null && currentPrice >= item.sell_at_or_above) {
      return "sell";
    }
    if (hitTrailingStop(item, currentPrice)) return "sell";
  }
  return "none";
}

// Trailing stop: sells if the price falls trail_percent below the highest
// price seen since the position was opened. Opt-in - a null trail_percent
// means the feature is off for this item.
export function hitTrailingStop(item: WatchlistItem, currentPrice: number): boolean {
  if (item.trail_percent === null || item.trail_high_price === null) return false;
  const stopPrice = item.trail_high_price * (1 - item.trail_percent / 100);
  return currentPrice <= stopPrice;
}

// The high-water mark only ever moves up while holding; it resets when a
// new position is opened.
export function nextTrailHigh(
  item: WatchlistItem,
  currentPrice: number,
): number | null {
  if (item.trail_percent === null) return null;
  if (item.trail_high_price === null) return currentPrice;
  return Math.max(item.trail_high_price, currentPrice);
}

// Marketable limit order buffer: past the current price by this fraction so
// the order fills like a market order would, while still capping slippage.
const LIMIT_PRICE_BUFFER = 0.002;

export function limitPriceFor(action: "buy" | "sell", currentPrice: number): number {
  const factor = action === "buy" ? 1 + LIMIT_PRICE_BUFFER : 1 - LIMIT_PRICE_BUFFER;
  return Math.round(currentPrice * factor * 100) / 100;
}
