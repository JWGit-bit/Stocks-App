import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserCredentials, type BrokerSettingsRow } from "@/lib/alpaca/credentials";
import { getClock } from "@/lib/alpaca/client";
import { getLatestTrades } from "@/lib/alpaca/marketData";
import {
  placeOrder,
  getOrder,
  getOrderByClientId,
  getPositions,
  getClosedOrders,
  type AlpacaOrder,
} from "@/lib/alpaca/orders";
import { decideAction, limitPriceFor, nextTrailHigh } from "@/lib/trading-engine/decide";
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

    // Positions can change outside this app (Alpaca's dashboard, another
    // tool, or a ticker re-added after it was removed). Sync against what
    // the broker actually holds before deciding anything.
    let restingQuery = supabase
      .from("watchlist_items")
      .select("*")
      .in("status", ["holding", "watching_buy"]);
    if (options.onlyUserId) restingQuery = restingQuery.eq("user_id", options.onlyUserId);
    const { data: restingItems } = await restingQuery;
    await reconcilePositions(supabase, (restingItems ?? []) as WatchlistItem[]);

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

// Keeps our idea of what we hold in step with what the broker actually
// holds, in both directions:
//   - we think holding, broker says no  -> log the closing sell, go back to
//     watching_buy (covers a position closed outside this app)
//   - we think watching_buy, broker says we hold it -> adopt it as holding,
//     so we don't buy a second time on top of an existing position
async function reconcilePositions(
  supabase: SupabaseClient,
  restingItems: WatchlistItem[],
) {
  const byUser = new Map<string, WatchlistItem[]>();
  for (const item of restingItems) {
    if (!byUser.has(item.user_id)) byUser.set(item.user_id, []);
    byUser.get(item.user_id)!.push(item);
  }

  for (const [userId, items] of byUser) {
    const credentials = await getUserCredentials(supabase, userId);
    if (!credentials) continue;

    let positions;
    try {
      positions = await getPositions(credentials.creds, credentials.mode);
    } catch {
      continue; // transient error - try again next tick
    }
    const positionBySymbol = new Map(positions.map((p) => [p.symbol, p]));

    // Adopt positions the broker holds that we think we're only watching.
    for (const item of items) {
      if (item.status !== "watching_buy") continue;
      const position = positionBySymbol.get(item.symbol);
      if (!position) continue;

      await supabase
        .from("watchlist_items")
        .update({
          status: "holding",
          trail_high_price:
            item.trail_percent !== null ? Number(position.avg_entry_price) : null,
        })
        .eq("id", item.id)
        .eq("status", "watching_buy");
    }

    const closedItems = items.filter(
      (i) => i.status === "holding" && !positionBySymbol.has(i.symbol),
    );
    if (closedItems.length === 0) continue;

    let closedOrders: AlpacaOrder[] = [];
    try {
      closedOrders = await getClosedOrders(credentials.creds, credentials.mode, {
        symbols: closedItems.map((i) => i.symbol),
      });
    } catch {
      // Fall through: still correct the status below, just without a
      // matched fill price.
    }

    for (const item of closedItems) {
      const { data: buyTrade } = await supabase
        .from("trades")
        .select("id, filled_avg_price, qty, alpaca_order_id")
        .eq("watchlist_item_id", item.id)
        .eq("side", "buy")
        .eq("status", "filled")
        .order("filled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sellOrder = closedOrders.find(
        (o) => o.symbol === item.symbol && o.side === "sell" && o.status === "filled",
      );

      // Don't double-log if this sell was already recorded.
      if (sellOrder) {
        const { data: existing } = await supabase
          .from("trades")
          .select("id")
          .eq("alpaca_order_id", sellOrder.id)
          .maybeSingle();
        if (!existing) {
          const filledAvgPrice = sellOrder.filled_avg_price
            ? Number(sellOrder.filled_avg_price)
            : null;
          const realizedPnl =
            filledAvgPrice !== null && buyTrade?.filled_avg_price
              ? (filledAvgPrice - Number(buyTrade.filled_avg_price)) * Number(buyTrade.qty)
              : null;

          await supabase.from("trades").insert({
            user_id: userId,
            watchlist_item_id: item.id,
            symbol: item.symbol,
            side: "sell",
            qty: sellOrder.filled_qty ? Number(sellOrder.filled_qty) : item.qty,
            alpaca_order_id: sellOrder.id,
            client_order_id: sellOrder.client_order_id,
            status: sellOrder.status,
            filled_avg_price: filledAvgPrice,
            realized_pnl: realizedPnl,
            is_paper: credentials.mode === "paper",
            source: "external",
            filled_at: new Date().toISOString(),
            raw_response: sellOrder,
          });
        }
      }

      await supabase
        .from("watchlist_items")
        .update({
          status: "watching_buy",
          open_order_id: null,
          trail_high_price: null,
        })
        .eq("id", item.id)
        .eq("status", "holding");
    }
  }
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

    // Seed the trailing high at the buy fill price; clear it on a sell so
    // the next position starts its own high-water mark.
    await supabase
      .from("watchlist_items")
      .update({
        status: wasBuy ? "holding" : "watching_buy",
        open_order_id: null,
        trail_high_price: wasBuy ? filledAvgPrice : null,
      })
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

    // Ratchet the trailing high up before deciding, so a new high in this
    // same tick raises the stop rather than being missed until the next one.
    if (item.status === "holding" && item.trail_percent !== null) {
      const newHigh = nextTrailHigh(item, quote.price);
      if (newHigh !== null && newHigh !== item.trail_high_price) {
        item.trail_high_price = newHigh;
        await supabase
          .from("watchlist_items")
          .update({ trail_high_price: newHigh })
          .eq("id", item.id);
      }
    }

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
      // A timeout or dropped connection doesn't mean the order was
      // rejected - it may have reached Alpaca anyway. Check by our own
      // client_order_id before assuming failure, otherwise reverting the
      // claim here would let the next tick place a second order.
      const landed = await getOrderByClientId(
        credentials.creds,
        credentials.mode,
        clientOrderId,
      );
      if (landed) {
        await supabase.from("trades").insert({
          user_id: userId,
          watchlist_item_id: item.id,
          symbol: item.symbol,
          side: action,
          qty: item.qty,
          requested_price: quote.price,
          alpaca_order_id: landed.id,
          client_order_id: clientOrderId,
          status: landed.status,
          is_paper: credentials.mode === "paper",
          source: "app",
          raw_response: landed,
        });
        await supabase
          .from("watchlist_items")
          .update({ open_order_id: landed.id })
          .eq("id", item.id);
        actionsTaken++;
        remainingTrades--;
        continue;
      }

      // Genuinely never placed: revert the claim so this item is retried on
      // the next tick, and record the failed attempt in trade history.
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
