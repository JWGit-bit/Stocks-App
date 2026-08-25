-- Optional trailing stop-loss, per watchlist item.
--
-- When trail_percent is set, the engine tracks the highest price seen since
-- the position was opened (trail_high_price) and sells if the price falls
-- more than trail_percent below that high. Null trail_percent = feature off,
-- which is the default, so existing items are unaffected.
alter table public.watchlist_items
  add column trail_percent numeric(6, 3),
  add column trail_high_price numeric(12, 4);

-- Distinguishes trades this app placed from ones it discovered after the
-- fact (e.g. a position closed directly in Alpaca's dashboard), so external
-- activity still shows up in trade history instead of silently vanishing.
alter table public.trades
  add column source text not null default 'app'
    check (source in ('app', 'external'));
