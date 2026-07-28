import "server-only";

export const PAPER_TRADING_BASE = "https://paper-api.alpaca.markets";
export const LIVE_TRADING_BASE = "https://api.alpaca.markets";
export const DATA_BASE = "https://data.alpaca.markets";

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
}

export function tradingBaseUrl(mode: "paper" | "live"): string {
  return mode === "paper" ? PAPER_TRADING_BASE : LIVE_TRADING_BASE;
}

function authHeaders(creds: AlpacaCredentials): HeadersInit {
  return {
    "APCA-API-KEY-ID": creds.keyId,
    "APCA-API-SECRET-KEY": creds.secretKey,
  };
}

// Shared request helper for both trading and data endpoints. Used directly
// by orders.ts for POST/GET calls that need a body.
export async function alpacaRequest(
  url: string,
  creds: AlpacaCredentials,
  init: RequestInit = {},
) {
  const res = await fetch(url, {
    ...init,
    // Prices, account balances, and order status must never be served from
    // Next.js's fetch Data Cache - a cached "latest price" is a wrong price.
    cache: "no-store",
    headers: {
      ...authHeaders(creds),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AlpacaError(res.status, body || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function alpacaFetch(url: string, creds: AlpacaCredentials) {
  return alpacaRequest(url, creds);
}

export class AlpacaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// GET /v2/account - also used to validate a key pair actually works.
export async function getAccount(
  creds: AlpacaCredentials,
  mode: "paper" | "live",
) {
  return alpacaFetch(`${tradingBaseUrl(mode)}/v2/account`, creds);
}

// GET /v2/clock - whether the market is currently open.
export async function getClock(creds: AlpacaCredentials, mode: "paper" | "live") {
  return alpacaFetch(`${tradingBaseUrl(mode)}/v2/clock`, creds) as Promise<{
    timestamp: string;
    is_open: boolean;
    next_open: string;
    next_close: string;
  }>;
}
