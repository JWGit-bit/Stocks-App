-- Per-ticker pause: stops the trading engine from acting on this one item
-- (new buys or sells) without removing it or its trade history from view.
-- Separate from broker_settings.trading_paused, which is an account-wide
-- kill switch.
alter table public.watchlist_items add column paused boolean not null default false;
