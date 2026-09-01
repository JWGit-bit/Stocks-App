import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getLatestTrades } from "@/lib/alpaca/marketData";
import { placeOrder, getOrderByClientId } from "@/lib/alpaca/orders";
import { limitPriceFor } from "@/lib/trading-engine/decide";
import type { WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sells a held position immediately at the user's explicit request, rather
// than waiting for a sell threshold or trailing stop to trigger. Writing to
// `trades` needs the admin client (RLS only grants users select), so the
// caller's ownership of the item is checked explicitly first.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: itemRow } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const item = itemRow as WatchlistItem | null;
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (item.status !== "holding") {
    return NextResponse.json(
      { error: `Can't sell ${item.symbol} - it isn't currently held.` },
      { status: 400 },
    );
  }

  const credentials = await getUserCredentials(supabase, user.id);
  if (!credentials) {
    return NextResponse.json(
      { error: "Connect your Alpaca keys in Settings first." },
      { status: 400 },
    );
  }

  let price: number;
  try {
    const [quote] = await getLatestTrades([item.symbol], credentials.creds);
    if (!quote) throw new Error("no quote");
    price = quote.price;
  } catch {
    return NextResponse.json(
      { error: "Could not get a current price from Alpaca to price the sell." },
      { status: 502 },
    );
  }

  const admin = createAdminClient();

  // Claim the item so the cron engine can't also act on it mid-flight.
  const { data: claimed } = await admin
    .from("watchlist_items")
    .update({ status: "pending_sell" })
    .eq("id", item.id)
    .eq("status", "holding")
    .select()
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json(
      { error: "That position is already being traded right now - try again shortly." },
      { status: 409 },
    );
  }

  const clientOrderId = `${item.id}-sell-${Date.now()}`;
  try {
    const order = await placeOrder(credentials.creds, credentials.mode, {
      symbol: item.symbol,
      qty: item.qty,
      side: "sell",
      limitPrice: limitPriceFor("sell", price),
      clientOrderId,
    });

    await admin.from("trades").insert({
      user_id: user.id,
      watchlist_item_id: item.id,
      symbol: item.symbol,
      side: "sell",
      qty: item.qty,
      requested_price: price,
      alpaca_order_id: order.id,
      client_order_id: clientOrderId,
      status: order.status,
      is_paper: credentials.mode === "paper",
      source: "app",
      raw_response: order,
    });
    await admin
      .from("watchlist_items")
      .update({ open_order_id: order.id })
      .eq("id", item.id);

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (err) {
    // The order may have reached Alpaca even though we lost the response
    // (timeout, dropped connection). Check before reverting, so a sell
    // that actually landed isn't left looking un-placed.
    const landed = await getOrderByClientId(
      credentials.creds,
      credentials.mode,
      clientOrderId,
    );
    if (landed) {
      await admin.from("trades").insert({
        user_id: user.id,
        watchlist_item_id: item.id,
        symbol: item.symbol,
        side: "sell",
        qty: item.qty,
        requested_price: price,
        alpaca_order_id: landed.id,
        client_order_id: clientOrderId,
        status: landed.status,
        is_paper: credentials.mode === "paper",
        source: "app",
        raw_response: landed,
      });
      await admin
        .from("watchlist_items")
        .update({ open_order_id: landed.id })
        .eq("id", item.id);
      return NextResponse.json({ ok: true, orderId: landed.id });
    }

    // Put the item back so it isn't stuck in pending_sell.
    await admin
      .from("watchlist_items")
      .update({ status: "holding", open_order_id: null })
      .eq("id", item.id);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? `Alpaca rejected the sell: ${err.message}` : "Sell failed",
      },
      { status: 502 },
    );
  }
}
