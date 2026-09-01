import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatchlistItem, WatchlistItemWithEntry } from "@/lib/types";

// Attaches what each held position actually cost, taken from its most recent
// filled buy. Used to show what a trailing stop would realize in dollars.
// One query for the whole list rather than one per row.
export async function attachEntryPrices(
  supabase: SupabaseClient,
  items: WatchlistItem[],
): Promise<WatchlistItemWithEntry[]> {
  if (items.length === 0) return [];

  const { data } = await supabase
    .from("trades")
    .select("watchlist_item_id, filled_avg_price, filled_at")
    .in(
      "watchlist_item_id",
      items.map((i) => i.id),
    )
    .eq("side", "buy")
    .eq("status", "filled")
    .order("filled_at", { ascending: false });

  // Rows arrive newest-first, so the first hit per item is its latest buy.
  const entryByItem = new Map<string, number>();
  for (const row of (data ?? []) as {
    watchlist_item_id: string | null;
    filled_avg_price: number | null;
  }[]) {
    if (!row.watchlist_item_id || row.filled_avg_price === null) continue;
    if (!entryByItem.has(row.watchlist_item_id)) {
      entryByItem.set(row.watchlist_item_id, Number(row.filled_avg_price));
    }
  }

  return items.map((item) => ({
    ...item,
    entry_price: entryByItem.get(item.id) ?? null,
  }));
}
