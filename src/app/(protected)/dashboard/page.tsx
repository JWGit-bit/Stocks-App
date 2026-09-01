import { createClient } from "@/lib/supabase/server";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getClock } from "@/lib/alpaca/client";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AccountSummary } from "@/components/AccountSummary";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import { attachEntryPrices } from "@/lib/entryPrices";
import type { WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at", { ascending: true });
  const items = await attachEntryPrices(supabase, (data ?? []) as WatchlistItem[]);

  // Null when unknown (no keys yet, or Alpaca unreachable) so the UI can
  // stay quiet rather than claiming the market is closed.
  let marketOpen: boolean | null = null;
  if (user) {
    const credentials = await getUserCredentials(supabase, user.id);
    if (credentials) {
      try {
        marketOpen = (await getClock(credentials.creds, credentials.mode)).is_open;
      } catch {
        marketOpen = null;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketStatusBanner />
      <AccountSummary />
      <WatchlistTable initialItems={items} marketOpen={marketOpen} />
    </div>
  );
}
