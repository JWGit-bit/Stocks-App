import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTradingCheck } from "@/lib/trading-engine/runCheck";

// Lets a logged-in user manually trigger the trading engine for just their
// own watchlist, so they don't have to wait for the next cron tick to see
// it work. Writing to `trades` requires the admin client (RLS only grants
// users select), so this route explicitly scopes the run to the caller.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runTradingCheck(admin, { onlyUserId: user.id });
  return NextResponse.json(result);
}
