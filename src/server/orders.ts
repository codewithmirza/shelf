import { z } from "zod";
import { cents, orderId as asOrderId, refundRequestId, type Cents, type OrderId } from "./domain/brand";
import type { PricedLine } from "./domain/cart";
import { domainError, type DomainError } from "./domain/errors";
import { prefixedId, type IdSource } from "./domain/ids";
import type { OrderState, RefundState } from "./domain/machines";
import { canRequestRefund } from "./domain/refund";
import { err, ok, type Result } from "./domain/result";
import { verifyToken } from "./auth/tokens";

// What a buyer may see about their order. No email, no address, no PayPal ids (IR-06, THR-06).
export interface OrderStatusRow {
  readonly id: OrderId;
  readonly state: OrderState;
  readonly amountCents: Cents;
  readonly refundedCents: Cents;
  readonly storeName: string;
  readonly lines: readonly PricedLine[];
  readonly tracking: { readonly carrier: string; readonly number: string } | null;
  readonly refundRequest: { readonly state: RefundState; readonly declineReason: string | null } | null;
  readonly events: readonly { readonly at: string; readonly actor: string; readonly type: string; readonly data: Record<string, unknown> }[];
}

export interface OrderStatusRepo {
  status(id: OrderId): Promise<OrderStatusRow | null>;
  // T-RFD-01 and its Event. "exists" when a pending request is already there (INV-06, the unique index).
  createRefundRequest(input: { orderId: OrderId; requestId: string; reason: string; amountCents: Cents; eventId: string; now: string }): Promise<"created" | "exists">;
}

export interface OrderDeps {
  readonly repo: OrderStatusRepo;
  readonly ids: IdSource;
  readonly tokenSecret: string;
}

async function authorised(deps: OrderDeps, rawOrderId: string, token: string): Promise<Result<OrderStatusRow, DomainError>> {
  const check = await verifyToken(deps.tokenSecret, token, "order", rawOrderId, new Date(deps.ids.now()));
  // A wrong or old token answers like a missing order, so order ids cannot be probed (AC-BUY-04-02).
  if (!check.ok) return err(domainError("not_found", check.reason));
  const row = await deps.repo.status(asOrderId(rawOrderId));
  return row ? ok(row) : err(domainError("not_found", "order"));
}

export const getOrderStatus = authorised;

// request_refund: creates a Pending request only. Approving it is a seller action (INV-05).
export async function requestRefund(deps: OrderDeps, rawOrderId: string, token: string, reason: string): Promise<Result<OrderStatusRow, DomainError>> {
  const found = await authorised(deps, rawOrderId, token);
  if (!found.ok) return found;
  const order = found.value;
  // A second ask returns the first request (AC-BUY-05-02).
  if (order.refundRequest?.state === "pending") return ok(order);
  const allowed = canRequestRefund(order, order.refundRequest ? [order.refundRequest] : []);
  if (!allowed.ok) return allowed;
  await deps.repo.createRefundRequest({
    orderId: order.id,
    requestId: refundRequestId(prefixedId("rfd", deps.ids)),
    reason,
    amountCents: allowed.value,
    eventId: prefixedId("evt", deps.ids),
    now: new Date(deps.ids.now()).toISOString(),
  });
  const after = await deps.repo.status(order.id);
  return after ? ok(after) : err(domainError("server.error", "order vanished"));
}

// The timeline text a buyer reads. Event types not listed here are internal and not shown.
const TIMELINE: Record<string, (d: Record<string, unknown>) => string> = {
  "order.created": () => "Order created",
  "order.approved": () => "Approved in PayPal",
  "order.captured": () => "Paid",
  "order.shipped": (d) => `Shipped${typeof d.carrier === "string" ? ` with ${d.carrier}` : ""}`,
  "order.cancelled": () => "Payment not finished",
  "order.refunded": () => "Refunded",
  "refund.requested": () => "Refund requested",
  "refund.approved": () => "Seller approved the refund",
  "refund.declined": () => "Seller declined the refund",
  "refund.done": () => "Refund sent",
  "refund.failed": () => "Refund failed; the seller will try again",
};

export function timeline(row: OrderStatusRow) {
  return row.events.flatMap((e) => {
    const text = TIMELINE[e.type];
    return text ? [{ at: e.at, actor: e.actor, text: text(e.data) }] : [];
  });
}

// ---- D1 adapter -------------------------------------------------------------------------------------------

const linesSchema = z.array(z.object({ variantId: z.string(), title: z.string(), options: z.record(z.string(), z.string()), quantity: z.number(), unitPriceCents: z.number(), lineTotalCents: z.number() }));

export function d1OrderStatusRepo(db: D1Database): OrderStatusRepo {
  return {
    async status(id) {
      const o = await db
        .prepare(
          `SELECT o.id, o.state, o.amount_cents, o.refunded_cents, o.carrier, o.tracking_number, s.name AS store_name, c.lines_json
           FROM orders o JOIN stores s ON s.id = o.store_id JOIN carts c ON c.id = o.cart_id WHERE o.id = ?`,
        )
        .bind(id)
        .first<{ id: string; state: OrderState; amount_cents: number; refunded_cents: number; carrier: string | null; tracking_number: string | null; store_name: string; lines_json: string }>();
      if (!o) return null;
      const [refunds, events] = await db.batch<Record<string, unknown>>([
        db.prepare("SELECT state, decline_reason FROM refund_requests WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").bind(id),
        db.prepare("SELECT created_at, actor, type, data_json FROM events WHERE order_id = ? ORDER BY created_at, id").bind(id),
      ]);
      const r = refunds?.results[0] as { state: RefundState; decline_reason: string | null } | undefined;
      return {
        id: asOrderId(o.id),
        state: o.state,
        amountCents: cents(o.amount_cents),
        refundedCents: cents(o.refunded_cents),
        storeName: o.store_name,
        lines: linesSchema.parse(JSON.parse(o.lines_json)) as unknown as PricedLine[],
        tracking: o.carrier && o.tracking_number ? { carrier: o.carrier, number: o.tracking_number } : null,
        refundRequest: r ? { state: r.state, declineReason: r.decline_reason } : null,
        events: ((events?.results ?? []) as { created_at: string; actor: string; type: string; data_json: string }[]).map((e) => ({ at: e.created_at, actor: e.actor, type: e.type, data: JSON.parse(e.data_json) as Record<string, unknown> })),
      };
    },
    async createRefundRequest(i) {
      try {
        await db.batch([
          db.prepare(
            `INSERT INTO refund_requests (id, order_id, reason, amount_cents, state, created_at, updated_at)
             SELECT ?, ?, ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND state IN ('captured','shipped'))`,
          ).bind(i.requestId, i.orderId, i.reason, i.amountCents, i.now, i.now, i.orderId),
          db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'buyer', 'refund.requested', ?, ? WHERE EXISTS (SELECT 1 FROM refund_requests WHERE id = ?)")
            .bind(i.eventId, i.orderId, JSON.stringify({ refund_request_id: i.requestId }), i.now, i.requestId),
        ]);
        return "created";
      } catch (e) {
        // The partial unique index refund_one_pending refused a second pending request.
        if (String(e).includes("UNIQUE")) return "exists";
        throw e;
      }
    },
  };
}
