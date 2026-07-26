import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTradingCheck } from "@/lib/trading-engine/runCheck";

// Hit by the external cron pinger (cron-job.org) every 1-2 minutes. Treat
// this endpoint as equivalent to a "place real trades" button - the bearer
// secret is the only thing standing between the public internet and the
// trading engine running for every user.
async function handle(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runTradingCheck(admin);
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
