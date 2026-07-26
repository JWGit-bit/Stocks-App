import { createClient } from "@/lib/supabase/server";
import { WatchlistTable } from "@/components/WatchlistTable";
import type { WatchlistItem } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at", { ascending: true });

  return <WatchlistTable initialItems={(data ?? []) as WatchlistItem[]} />;
}
