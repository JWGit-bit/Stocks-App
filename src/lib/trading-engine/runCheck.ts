import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserCredentials, type BrokerSettingsRow } from "@/lib/alpaca/credentials";
import { getClock } from "@/lib/alpaca/client";
import { getLatestTrades } from "@/lib/alpaca/marketData";
import { placeOrder, getOrder } from "@/lib/alpaca/orders";
import { decideAction, limitPriceFor } from "@/lib/trading-engine/decide";
import type { WatchlistItem } from "@/lib/types";

const STALE_QUOTE_MS = 5 * 60 * 1000;

export interface RunCheckResult {
  itemsChecked: number;
  actionsTaken: number;
  error: string | null;
}

// Scans watchlist items and places/reconciles paper (or, if explicitly
// gated on, live) orders. Pass onlyUserId to scope a run to a single user
// (the authenticated "run now" button); omit it for the cron sweep across
// everyone. `supabase` must be an admin (service-role) client - this
// function writes to `trades`, which regular users can't insert into.
export async function runTradingCheck(
  supabase: SupabaseClient,
  options: { onlyUserId?: string } = {},
): Promise<RunCheckResult> {
  const startedAt = new Date();
  let itemsChecked = 0;
  let actionsTaken = 0;
  let error: string | null = null;

  try {
    let pendingQuery = supabase
      .from("watchlist_items")
      .select("*")
      .in("status", ["pending_buy", "pending_sell"])
      .not("open_order_id", "is", null);
    if (options.onlyUserId) pendingQuery = pendingQuery.eq("user_id", options.onlyUserId);
    const { data: pendingItems } = await pendingQuery;

    for (const item of (pendingItems ?? []) as WatchlistItem[]) {
      await reconcileItem(supabase, item);
    }

    let activeQuery = supabase
      .from("watchlist_items")
      .select("*")
      .in("status", ["watching_buy", "holding"])
      .eq("paused", false);
    if (options.onlyUserId) activeQuery = activeQuery.eq("user_id", options.onlyUserId);
    const { data: activeItems } = await activeQuery;

    const items = (activeItems ?? []) as WatchlistItem[];
    itemsChecked = items.length;

    const byUser = new Map<string, WatchlistItem[]>();
    for (const item of items) {
      if (!byUser.has(item.user_id)) byUser.set(item.user_id, []);
      byUser.get(item.user_id)!.push(item);
    }

    for (const [userId, userItems] of byUser) {
      actionsTaken += await processUser(supabase, userId, userItems);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await supabase.from("job_runs").insert({
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    items_checked: itemsChecked,
    actions_taken: actionsTaken,
    error,
  });

  return { itemsChecked, actionsTaken, error };
}

async function reconcileItem(supabase: SupabaseClient, item: WatchlistItem) {
  const credentials = await getUserCredentials(supabase, item.user_id);
  if (!credentials || !item.open_order_id) return;

  let order;
  try {
    order = await getOrder(credentials.creds, credentials.mode, item.open_order_id);
  } catch {
    return; // transient error - try again next tick
  }

  if (order.status === "filled") {
    const wasBuy = item.status === "pending_buy";
    const filledAvgPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;

    // A sell fill closes out exactly one prior buy for this item - the state
    // machine never lets a second buy happen before the first is sold - so
    // the most recent filled buy for this item is always the correct match.
    let realizedPnl: number | null = null;
    if (!wasBuy && filledAvgPrice !== null) {
      const { data: buyTrade } = await supabase
        .from("trades")
        .select("filled_avg_price, qty")
        .eq("watchlist_item_id", item.id)
        .eq("side", "buy")
        .eq("status", "filled")
        .order("filled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (buyTrade?.filled_avg_price) {
        realizedPnl = (filledAvgPrice - Number(buyTrade.filled_avg_price)) * Number(buyTrade.qty);
      }
    }

    await supabase
      .from("trades")
      .update({
        status: order.status,
        filled_avg_price: filledAvgPrice,
        filled_at: new Date().toISOString(),
        raw_response: order,
        ...(realizedPnl !== null ? { realized_pnl: realizedPnl } : {}),
      })
      .eq("alpaca_order_id", order.id);

    await supabase
      .from("watchlist_items")
      .update({ status: wasBuy ? "holding" : "watching_buy", open_order_id: null })
      .eq("id", item.id);
    return;
  }

  if (["canceled", "expired", "rejected"].includes(order.status)) {
    const wasBuy = item.status === "pending_buy";
    await supabase
      .from("trades")
      .update({ status: order.status, raw_response: order })
      .eq("alpaca_order_id", order.id);

    await supabase
      .from("watchlist_items")
      .update({ status: wasBuy ? "watching_buy" : "holding", open_order_id: null })
      .eq("id", item.id);
  }
  // otherwise still open - leave as-is, reconciled again next tick
}

async function processUser(
  supabase: SupabaseClient,
  userId: string,
  items: WatchlistItem[],
): Promise<number> {
  const { data: settingsRow } = await supabase
    .from("broker_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = settingsRow as BrokerSettingsRow | null;
  if (!settings || settings.trading_paused) return 0;

  const credentials = await getUserCredentials(supabase, userId);
  if (!credentials) return 0;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: tradesToday } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("submitted_at", startOfDay.toISOString());
  let remainingTrades = settings.max_daily_trades - (tradesToday ?? 0);
  if (remainingTrades <= 0) return 0;

  try {
    const clock = await getClock(credentials.creds, credentials.mode);
    if (!clock.is_open) return 0;
  } catch {
    return 0;
  }

  let prices;
  try {
    prices = await getLatestTrades(
      items.map((i) => i.symbol),
      credentials.creds,
    );
  } catch {
    return 0;
  }
  const priceBySymbol = new Map(prices.map((p) => [p.symbol, p]));

  let actionsTaken = 0;
  for (const item of items) {
    if (remainingTrades <= 0) break;
    const quote = priceBySymbol.get(item.symbol);
    if (!quote) continue;
    if (Date.now() - new Date(quote.timestamp).getTime() > STALE_QUOTE_MS) continue;

    const action = decideAction(item, quote.price);
    if (action === "none") continue;

    const claimed = await claimItem(supabase, item, action);
    if (!claimed) continue;

    const limitPrice = limitPriceFor(action, quote.price);
    const clientOrderId = `${item.id}-${action}-${Date.now()}`;

    try {
      const order = await placeOrder(credentials.creds, credentials.mode, {
        symbol: item.symbol,
        qty: item.qty,
        side: action,
        limitPrice,
        clientOrderId,
      });

      await supabase.from("trades").insert({
        user_id: userId,
        watchlist_item_id: item.id,
        symbol: item.symbol,
        side: action,
        qty: item.qty,
        requested_price: quote.price,
        alpaca_order_id: order.id,
        client_order_id: clientOrderId,
        status: order.status,
        is_paper: credentials.mode === "paper",
        raw_response: order,
      });
      await supabase
        .from("watchlist_items")
        .update({ open_order_id: order.id })
        .eq("id", item.id);

      actionsTaken++;
      remainingTrades--;
    } catch (err) {
      // Revert the claim so this item is retried on the next tick, and
      // record the failed attempt so it's visible in trade history.
      await supabase
        .from("watchlist_items")
        .update({ status: item.status, open_order_id: null })
        .eq("id", item.id);
      await supabase.from("trades").insert({
        user_id: userId,
        watchlist_item_id: item.id,
        symbol: item.symbol,
        side: action,
        qty: item.qty,
        requested_price: quote.price,
        client_order_id: clientOrderId,
        status: "failed",
        is_paper: credentials.mode === "paper",
        raw_response: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return actionsTaken;
}

// Atomically transitions watching_buy -> pending_buy or holding ->
// pending_sell, only succeeding if the row is still in the expected state.
// This is what stops two overlapping runs from both acting on the same item.
async function claimItem(
  supabase: SupabaseClient,
  item: WatchlistItem,
  action: "buy" | "sell",
): Promise<boolean> {
  const nextStatus = action === "buy" ? "pending_buy" : "pending_sell";
  const { data } = await supabase
    .from("watchlist_items")
    .update({ status: nextStatus, last_checked_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", item.status)
    .select()
    .maybeSingle();
  return !!data;
}
