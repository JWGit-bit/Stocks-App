import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getAccount } from "@/lib/alpaca/client";
import { getLatestTrades } from "@/lib/alpaca/marketData";
import type { WatchlistItem } from "@/lib/types";

// Account balances and P/L must never be served from Next's route cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getUserCredentials(supabase, user.id);
  if (!credentials) {
    return NextResponse.json(
      { error: "Connect your Alpaca paper trading keys in Settings first." },
      { status: 400 },
    );
  }

  let account;
  try {
    account = await getAccount(credentials.creds, credentials.mode);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Alpaca for account info right now." },
      { status: 502 },
    );
  }

  const { data: realizedRows } = await supabase
    .from("trades")
    .select("realized_pnl")
    .eq("user_id", user.id)
    .not("realized_pnl", "is", null);
  const totalRealizedPnl = (realizedRows ?? []).reduce(
    (sum, r) => sum + Number((r as { realized_pnl: number }).realized_pnl),
    0,
  );

  const { data: heldItemsRaw } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["holding", "pending_sell"]);
  const heldItems = (heldItemsRaw ?? []) as WatchlistItem[];

  let totalUnrealizedPnl = 0;
  if (heldItems.length > 0) {
    let prices: { symbol: string; price: number }[] = [];
    try {
      prices = await getLatestTrades(
        heldItems.map((i) => i.symbol),
        credentials.creds,
      );
    } catch {
      // leave unrealized at 0 if prices can't be fetched right now
    }
    const priceBySymbol = new Map(prices.map((p) => [p.symbol, p.price]));

    for (const item of heldItems) {
      const currentPrice = priceBySymbol.get(item.symbol);
      if (currentPrice === undefined) continue;
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
        totalUnrealizedPnl +=
          (currentPrice - Number(buyTrade.filled_avg_price)) * Number(buyTrade.qty);
      }
    }
  }

  return NextResponse.json({
    mode: credentials.mode,
    cash: Number(account.cash),
    equity: Number(account.equity),
    buyingPower: Number(account.buying_power),
    portfolioValue: Number(account.portfolio_value),
    totalRealizedPnl,
    totalUnrealizedPnl,
  });
}
