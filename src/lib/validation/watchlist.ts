const SYMBOL_RE = /^[A-Z]{1,6}(\.[A-Z])?$/;

export interface WatchlistInput {
  symbol: string;
  buyAtOrBelow: number | null;
  sellAtOrAbove: number | null;
  qty: number;
}

export function parseWatchlistInput(
  body: unknown,
): { ok: true; value: WatchlistInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;

  const symbol = String(b.symbol ?? "")
    .trim()
    .toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return { ok: false, error: "Symbol must look like a stock ticker (e.g. AAPL, BRK.B)" };
  }

  const buyAtOrBelow = b.buyAtOrBelow === null || b.buyAtOrBelow === undefined
    ? null
    : Number(b.buyAtOrBelow);
  const sellAtOrAbove = b.sellAtOrAbove === null || b.sellAtOrAbove === undefined
    ? null
    : Number(b.sellAtOrAbove);

  if (buyAtOrBelow !== null && (!Number.isFinite(buyAtOrBelow) || buyAtOrBelow <= 0)) {
    return { ok: false, error: "Buy threshold must be a positive number" };
  }
  if (sellAtOrAbove !== null && (!Number.isFinite(sellAtOrAbove) || sellAtOrAbove <= 0)) {
    return { ok: false, error: "Sell threshold must be a positive number" };
  }
  if (buyAtOrBelow === null && sellAtOrAbove === null) {
    return { ok: false, error: "Set at least one of a buy or sell threshold" };
  }

  const qty = Number(b.qty ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive number" };
  }

  return { ok: true, value: { symbol, buyAtOrBelow, sellAtOrAbove, qty } };
}
