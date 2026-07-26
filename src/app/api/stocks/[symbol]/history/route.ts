import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getBars } from "@/lib/alpaca/marketData";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
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

  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 6);

  try {
    const bars = await getBars(symbol.toUpperCase(), credentials.creds, {
      timeframe: "1Day",
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return NextResponse.json({ bars });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch price history from Alpaca right now." },
      { status: 502 },
    );
  }
}
