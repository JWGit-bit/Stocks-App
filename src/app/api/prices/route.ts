import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getLatestTrades } from "@/lib/alpaca/marketData";

// Live prices must never be served from Next's route cache.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ prices: [] });
  }

  const credentials = await getUserCredentials(supabase, user.id);
  if (!credentials) {
    return NextResponse.json(
      { error: "Connect your Alpaca paper trading keys in Settings first." },
      { status: 400 },
    );
  }

  try {
    const prices = await getLatestTrades(symbols, credentials.creds);
    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch prices from Alpaca right now." },
      { status: 502 },
    );
  }
}
