import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCredentials } from "@/lib/alpaca/credentials";
import { getClock } from "@/lib/alpaca/client";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const clock = await getClock(credentials.creds, credentials.mode);
    return NextResponse.json({
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach Alpaca for market status right now." },
      { status: 502 },
    );
  }
}
