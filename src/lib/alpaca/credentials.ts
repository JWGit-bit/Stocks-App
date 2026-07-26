import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import type { AlpacaCredentials } from "@/lib/alpaca/client";

export interface BrokerSettingsRow {
  user_id: string;
  alpaca_paper_key_enc: string | null;
  alpaca_paper_secret_enc: string | null;
  alpaca_live_key_enc: string | null;
  alpaca_live_secret_enc: string | null;
  is_live_mode: boolean;
  live_mode_confirmed_at: string | null;
  trading_paused: boolean;
  max_daily_trades: number;
}

// Single place that decides paper vs. live for a user. Live keys are only
// ever used when both is_live_mode is on AND the user has explicitly
// confirmed it (live_mode_confirmed_at is set) - do not duplicate this
// check elsewhere.
export async function getUserCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ mode: "paper" | "live"; creds: AlpacaCredentials } | null> {
  const { data, error } = await supabase
    .from("broker_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const settings = data as BrokerSettingsRow;
  const useLive = settings.is_live_mode && !!settings.live_mode_confirmed_at;
  const mode: "paper" | "live" = useLive ? "live" : "paper";

  const keyEnc = useLive ? settings.alpaca_live_key_enc : settings.alpaca_paper_key_enc;
  const secretEnc = useLive
    ? settings.alpaca_live_secret_enc
    : settings.alpaca_paper_secret_enc;
  if (!keyEnc || !secretEnc) return null;

  return {
    mode,
    creds: { keyId: decrypt(keyEnc), secretKey: decrypt(secretEnc) },
  };
}
