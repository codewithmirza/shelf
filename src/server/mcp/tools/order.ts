import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { formatUsd, toMoney } from "../../domain/money";
import { getOrderStatus, requestRefund, timeline, type OrderDeps, type OrderStatusRow } from "../../orders";
import { toolError } from "../result";
import { viewMeta } from "../ui";

const ids = {
  order_id: z.string().regex(/^ord_[0-9A-Z]{26}$/).describe("The order id from start_checkout."),
  order_token: z.string().min(10).max(400).describe("The order token from start_checkout."),
};

const STATE_WORD: Record<OrderStatusRow["state"], string> = {
  created: "Waiting for payment",
  approved: "Approved, finishing payment",
  captured: "Paid",
  shipped: "Shipped",
  refunded: "Refunded",
  cancelled: "Payment not finished",
};

const REFUND_WORD = { pending: "Waiting for the seller", approved: "Approved, refund on its way", declined: "Declined", done: "Refunded", failed: "Refund failed, the seller will try again" } as const;

export function toOrderView(o: OrderStatusRow) {
  return {
    id: o.id,
    state: o.state,
    store: o.storeName,
    total: toMoney(o.amountCents),
    lines: o.lines.map((l) => ({ variant_id: l.variantId, title: l.title, options: { ...l.options }, quantity: l.quantity, unit_price: toMoney(l.unitPriceCents), line_total: toMoney(l.lineTotalCents) })),
    tracking: o.tracking,
    refund_request: o.refundRequest ? { state: o.refundRequest.state, decline_reason: o.refundRequest.declineReason } : null,
    timeline: timeline(o),
  };
}

export function orderText(o: OrderStatusRow): string {
  const parts = [`Order ${o.id} at ${o.storeName}: ${STATE_WORD[o.state]}, ${formatUsd(o.amountCents)}.`];
  if (o.tracking) parts.push(`Tracking: ${o.tracking.carrier} ${o.tracking.number}.`);
  if (o.refundRequest) parts.push(`Refund: ${REFUND_WORD[o.refundRequest.state]}${o.refundRequest.declineReason ? ` (${o.refundRequest.declineReason})` : ""}.`);
  return parts.join(" ");
}

export function registerOrderTools(server: McpServer, deps: OrderDeps): void {
  registerAppTool(
    server,
    "get_order_status",
    {
      title: "Order status",
      description: "Read one order: state, items, tracking, refund request and timeline. Only this tool says whether an order is paid (captured).",
      inputSchema: z.object(ids),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ...viewMeta, ui: { ...viewMeta.ui, visibility: ["model", "app"] } },
    },
    async (args) => {
      const r = await getOrderStatus(deps, args.order_id, args.order_token);
      if (!r.ok) return toolError(r.error);
      return { content: [{ type: "text", text: orderText(r.value) }], structuredContent: { view: "order", order: toOrderView(r.value) } };
    },
  );

  registerAppTool(
    server,
    "request_refund",
    {
      title: "Ask for a refund",
      description: "Ask the seller for a refund of a paid order. This only creates a request; the seller decides. Asking twice returns the same request.",
      inputSchema: z.object({ ...ids, reason: z.string().trim().min(1).max(500).describe("Why the buyer wants a refund, in their words.") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: viewMeta,
    },
    async (args) => {
      const r = await requestRefund(deps, args.order_id, args.order_token, args.reason);
      if (!r.ok) return toolError(r.error);
      return { content: [{ type: "text", text: orderText(r.value) }], structuredContent: { view: "order", order: toOrderView(r.value) } };
    },
  );
}
