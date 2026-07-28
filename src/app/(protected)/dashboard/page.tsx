import { createClient } from "@/lib/supabase/server";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AccountSummary } from "@/components/AccountSummary";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import type { WatchlistItem } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <MarketStatusBanner />
      <AccountSummary />
      <WatchlistTable initialItems={(data ?? []) as WatchlistItem[]} />
    </div>
  );
}
