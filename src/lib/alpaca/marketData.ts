import "server-only";
import {
  DATA_BASE,
  ALPACA_TIMEOUT_MS,
  type AlpacaCredentials,
} from "@/lib/alpaca/client";

interface LatestTradesResponse {
  trades: Record<string, { p: number; t: string; s: number }>;
}

export interface LatestPrice {
  symbol: string;
  price: number;
  timestamp: string;
}

// Batches all requested symbols into a single call to conserve rate limits.
export async function getLatestTrades(
  symbols: string[],
  creds: AlpacaCredentials,
): Promise<LatestPrice[]> {
  if (symbols.length === 0) return [];
  const url = `${DATA_BASE}/v2/stocks/trades/latest?symbols=${encodeURIComponent(symbols.join(","))}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ALPACA_TIMEOUT_MS),
    headers: {
      "APCA-API-KEY-ID": creds.keyId,
      "APCA-API-SECRET-KEY": creds.secretKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Alpaca market data error (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as LatestTradesResponse;
  return Object.entries(json.trades ?? {}).map(([symbol, trade]) => ({
    symbol,
    price: trade.p,
    timestamp: trade.t,
  }));
}

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export async function getBars(
  symbol: string,
  creds: AlpacaCredentials,
  options: { timeframe?: string; start?: string; end?: string } = {},
): Promise<Bar[]> {
  const { timeframe = "1Day", start, end } = options;
  // Free Alpaca accounts only have entitlement to the IEX feed, not SIP;
  // asking for SIP (the default) on those accounts returns a 403.
  const params = new URLSearchParams({ timeframe, feed: "iex" });
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const url = `${DATA_BASE}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ALPACA_TIMEOUT_MS),
    headers: {
      "APCA-API-KEY-ID": creds.keyId,
      "APCA-API-SECRET-KEY": creds.secretKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Alpaca market data error (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { bars: Bar[] };
  return json.bars ?? [];
}
