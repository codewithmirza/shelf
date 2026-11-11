import { payPage } from "@/server/checkout";
import { toMoney } from "@/server/domain/money";
import { errorResponse, json, shelfEnv } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";

// GET /api/pay/{order}?t=: what the Pay page shows (Gate 5 HTTP routes). The signed link is the only key.
export async function GET(request: Request, { params }: { params: Promise<{ order: string }> }) {
  const env = shelfEnv();
  const { order } = await params;
  const r = await payPage(checkoutDeps(env), order, new URL(request.url).searchParams.get("t") ?? "");
  if (!r.ok) return errorResponse(r.error);
  const { cart, store } = r.value;
  return json({
    state: r.value.order.state,
    store: { name: store.name, refund_policy: store.refundPolicy },
    lines: cart.lines.map((l) => ({ title: l.title, options: l.options, quantity: l.quantity, line_total: toMoney(l.lineTotalCents) })),
    subtotal: toMoney(cart.subtotalCents),
    shipping: toMoney(cart.shippingCents),
    total: toMoney(r.value.order.amountCents),
    paypal_order_id: r.value.order.paypalOrderId,
    client_id: env.PAYPAL_CLIENT_ID,
  });
}
