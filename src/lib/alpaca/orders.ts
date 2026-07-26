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
