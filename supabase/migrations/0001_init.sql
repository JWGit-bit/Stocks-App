-- Profiles: one row per signed-up user, auto-created on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Broker settings: encrypted Alpaca key pairs + trading mode/safety flags, one row per user.
create table public.broker_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alpaca_paper_key_enc text,
  alpaca_paper_secret_enc text,
  alpaca_live_key_enc text,
  alpaca_live_secret_enc text,
  is_live_mode boolean not null default false,
  live_mode_confirmed_at timestamptz,
  trading_paused boolean not null default false,
  max_daily_trades int not null default 20,
  updated_at timestamptz not null default now()
);

alter table public.broker_settings enable row level security;

create policy "broker_settings_all_own" on public.broker_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Watchlist items: one row per ticker per user, with the buy/sell thresholds
-- and the state machine driving the trading engine.
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  buy_at_or_below numeric(12, 4),
  sell_at_or_above numeric(12, 4),
  qty numeric(12, 4) not null default 1,
  status text not null default 'watching_buy'
    check (status in ('watching_buy', 'pending_buy', 'holding', 'pending_sell')),
  open_order_id text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.watchlist_items enable row level security;

create policy "watchlist_items_all_own" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trades: append-only order/fill history.
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  watchlist_item_id uuid references public.watchlist_items (id) on delete set null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  qty numeric(12, 4),
  requested_price numeric(12, 4),
  alpaca_order_id text,
  client_order_id text unique,
  status text,
  filled_avg_price numeric(12, 4),
  is_paper boolean not null default true,
  submitted_at timestamptz not null default now(),
  filled_at timestamptz,
  raw_response jsonb
);

alter table public.trades enable row level security;

create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);

-- Trades are only ever written by the server (service role), so no
-- insert/update policy is needed for regular users.

create index trades_user_id_idx on public.trades (user_id);
create index trades_symbol_idx on public.trades (symbol);

-- Job runs: observability for each cron tick. Not user-scoped, so no RLS
-- policies are added for regular users; only the service role reads/writes it.
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_checked int,
  actions_taken int,
  error text
);

alter table public.job_runs enable row level security;
