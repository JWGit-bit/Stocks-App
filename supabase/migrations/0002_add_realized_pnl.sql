-- Realized profit/loss for a sell trade, computed when the sell fills by
-- comparing against the matching prior buy fill for the same watchlist item.
-- Null for buy trades and for sells that haven't filled yet.
alter table public.trades add column realized_pnl numeric(12, 4);
