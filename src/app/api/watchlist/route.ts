import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseWatchlistInput } from "@/lib/validation/watchlist";
import { attachEntryPrices } from "@/lib/entryPrices";
import type { WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const items = await attachEntryPrices(supabase, (data ?? []) as WatchlistItem[]);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseWatchlistInput(await request.json());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { symbol, buyAtOrBelow, sellAtOrAbove, qty, trailPercent } = parsed.value;

  const { data, error } = await supabase
    .from("watchlist_items")
    .insert({
      user_id: user.id,
      symbol,
      buy_at_or_below: buyAtOrBelow,
      sell_at_or_above: sellAtOrAbove,
      qty,
      trail_percent: trailPercent,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message =
      error.code === "23505" ? `${symbol} is already on your watchlist` : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ item: data }, { status: 201 });
}
