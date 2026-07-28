import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getAccount, AlpacaError } from "@/lib/alpaca/client";
import type { BrokerSettingsRow } from "@/lib/alpaca/credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("broker_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const settings = data as BrokerSettingsRow | null;

  return NextResponse.json({
    paperKeyConfigured: !!settings?.alpaca_paper_key_enc,
    liveKeyConfigured: !!settings?.alpaca_live_key_enc,
    isLiveMode: settings?.is_live_mode ?? false,
    tradingPaused: settings?.trading_paused ?? false,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const keyId = String(body.keyId ?? "").trim();
  const secretKey = String(body.secretKey ?? "").trim();
  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: "Both an API key ID and secret key are required" },
      { status: 400 },
    );
  }

  // Only paper keys are accepted here for now - live trading is a separate,
  // explicitly-gated step that isn't wired up yet.
  try {
    await getAccount({ keyId, secretKey }, "paper");
  } catch (err) {
    const message =
      err instanceof AlpacaError
        ? `Alpaca rejected these keys (${err.status}). Double-check you copied the paper trading keys, not live.`
        : "Could not reach Alpaca to verify these keys.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error } = await supabase.from("broker_settings").upsert(
    {
      user_id: user.id,
      alpaca_paper_key_enc: encrypt(keyId),
      alpaca_paper_secret_enc: encrypt(secretKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
