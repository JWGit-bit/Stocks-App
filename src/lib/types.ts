export type WatchlistStatus =
  | "watching_buy"
  | "pending_buy"
  | "holding"
  | "pending_sell";

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  buy_at_or_below: number | null;
  sell_at_or_above: number | null;
  qty: number;
  status: WatchlistStatus;
  paused: boolean;
  open_order_id: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  watchlist_item_id: string | null;
  symbol: string;
  side: "buy" | "sell";
  qty: number | null;
  requested_price: number | null;
  alpaca_order_id: string | null;
  client_order_id: string | null;
  status: string | null;
  filled_avg_price: number | null;
  realized_pnl: number | null;
  is_paper: boolean;
  submitted_at: string;
  filled_at: string | null;
  raw_response: unknown;
}
