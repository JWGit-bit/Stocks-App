import "server-only";
import { alpacaRequest, tradingBaseUrl, type AlpacaCredentials } from "@/lib/alpaca/client";

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
  limit_price: string | null;
}

// Places a marketable limit order: the limit price is set just past the
// current market price (a small buffer) so it fills essentially immediately
// like a market order would, while still capping downside slippage.
export async function placeOrder(
  creds: AlpacaCredentials,
  mode: "paper" | "live",
  order: {
    symbol: string;
    qty: number;
    side: "buy" | "sell";
    limitPrice: number;
    clientOrderId: string;
  },
): Promise<AlpacaOrder> {
  return alpacaRequest(`${tradingBaseUrl(mode)}/v2/orders`, creds, {
    method: "POST",
    body: JSON.stringify({
      symbol: order.symbol,
      qty: String(order.qty),
      side: order.side,
      type: "limit",
      time_in_force: "day",
      limit_price: order.limitPrice.toFixed(2),
      client_order_id: order.clientOrderId,
    }),
  }) as Promise<AlpacaOrder>;
}

export async function getOrder(
  creds: AlpacaCredentials,
  mode: "paper" | "live",
  orderId: string,
): Promise<AlpacaOrder> {
  return alpacaRequest(
    `${tradingBaseUrl(mode)}/v2/orders/${encodeURIComponent(orderId)}`,
    creds,
  ) as Promise<AlpacaOrder>;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string | null;
}

// GET /v2/positions - what the broker says we actually hold right now.
// Needed because a position can be closed outside this app (e.g. from
// Alpaca's own dashboard), which no order-status poll of ours would catch.
export async function getPositions(
  creds: AlpacaCredentials,
  mode: "paper" | "live",
): Promise<AlpacaPosition[]> {
  return alpacaRequest(`${tradingBaseUrl(mode)}/v2/positions`, creds) as Promise<
    AlpacaPosition[]
  >;
}

// GET /v2/orders?status=closed - recently closed orders, used to find the
// externally-placed sell that closed a position so it can be logged with a
// real fill price rather than guessed at.
export async function getClosedOrders(
  creds: AlpacaCredentials,
  mode: "paper" | "live",
  options: { symbols?: string[]; after?: string; limit?: number } = {},
): Promise<AlpacaOrder[]> {
  const params = new URLSearchParams({
    status: "closed",
    limit: String(options.limit ?? 100),
    direction: "desc",
  });
  if (options.symbols?.length) params.set("symbols", options.symbols.join(","));
  if (options.after) params.set("after", options.after);

  return alpacaRequest(
    `${tradingBaseUrl(mode)}/v2/orders?${params.toString()}`,
    creds,
  ) as Promise<AlpacaOrder[]>;
}
