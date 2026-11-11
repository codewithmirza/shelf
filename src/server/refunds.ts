import { z } from "zod";
import { captureId as asCaptureId, cents, orderId as asOrderId, paypalOrderId as asPayPalOrderId, refundRequestId, type Cents, type StoreId } from "./domain/brand";
import { domainError, type DomainError } from "./domain/errors";
import { prefixedId, type IdSource } from "./domain/ids";
import { requestKeys } from "./domain/keys";
import { orderMachine, refundMachine, type OrderState, type RefundState } from "./domain/machines";
import { checkRefundAmount } from "./domain/refund";
import { assertNever, err, ok, type Result } from "./domain/result";
import type { PayPalFailure } from "./paypal/http";
import type { RefundOutcome } from "./paypal/refunds";

// The two PayPal calls a seller can cause. Real ones in paypal/orders.ts and paypal/refunds.ts.
export interface SellerPayPalPort {
  addTracking(input: { paypalOrderId: string; captureId: string; carrier: string; trackingNumber: string; requestId: string }): Promise<Result<true, PayPalFailure>>;
  refund(captureId: string, amount: Cents, requestId: string): Promise<Result<RefundOutcome, PayPalFailure>>;
}

export interface SellerOrderDeps {
  readonly db: D1Database;
  readonly paypal: SellerPayPalPort;
  readonly ids: IdSource;
}

export interface SellerOrderSummary {
  readonly id: string;
  readonly state: OrderState;
  readonly amountCents: Cents;
  readonly lineTitles: readonly string[];
  readonly createdAt: string;
  readonly refundRequest: { readonly id: string; readonly state: RefundState; readonly reason: string; readonly amountCents: Cents } | null;
}

export interface SellerOrderDetail extends SellerOrderSummary {
  readonly lines: readonly { title: string; options: Record<string, string>; quantity: number; lineTotalCents: number }[];
  readonly shippingCents: Cents;
  // The seller sees who to ship to; the model never does (IR-06).
  readonly buyerEmail: string | null;
  readonly shipTo: string | null;
  readonly tracking: { readonly carrier: string; readonly number: string } | null;
  readonly events: readonly { at: string; actor: string; type: string }[];
}

const linesSchema = z.array(z.object({ title: z.string(), options: z.record(z.string(), z.string()), quantity: z.number(), lineTotalCents: z.number() }).passthrough());

// PayPal's shipping block, as one line: "Ben Carter, 120 Hill St, Portland, OR 97205, US".
export function shipToLine(json: string | null): string | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as { name?: { full_name?: string }; address?: Record<string, string> };
    const a = s.address ?? {};
    const parts = [s.name?.full_name, a.address_line_1, a.address_line_2, a.admin_area_2, [a.admin_area_1, a.postal_code].filter(Boolean).join(" "), a.country_code];
    return parts.filter((p) => p && p.trim()).join(", ") || null;
  } catch {
    return null;
  }
}

// Captured, shipped and refunded orders, plus any with a pending request. Created or cancelled orders were never paid.
export async function listSellerOrders(db: D1Database, store: StoreId): Promise<SellerOrderSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.state, o.amount_cents, o.created_at, c.lines_json, r.id AS rid, r.state AS rstate, r.reason, r.amount_cents AS ramount
       FROM orders o JOIN carts c ON c.id = o.cart_id
       LEFT JOIN refund_requests r ON r.id = (SELECT id FROM refund_requests WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1)
       WHERE o.store_id = ? AND o.state IN ('captured','shipped','refunded') ORDER BY o.created_at DESC LIMIT 100`,
    )
    .bind(store)
    .all<{ id: string; state: OrderState; amount_cents: number; created_at: string; lines_json: string; rid: string | null; rstate: RefundState | null; reason: string | null; ramount: number | null }>();
  return results.map((r) => ({
    id: r.id, state: r.state, amountCents: cents(r.amount_cents), createdAt: r.created_at,
    lineTitles: linesSchema.parse(JSON.parse(r.lines_json)).map((l) => `${l.title}${Object.values(l.options).length ? `, ${Object.values(l.options).join(", ")}` : ""}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`),
    refundRequest: r.rid ? { id: r.rid, state: r.rstate!, reason: r.reason!, amountCents: cents(r.ramount!) } : null,
  }));
}

export async function sellerOrder(db: D1Database, store: StoreId, id: string): Promise<SellerOrderDetail | null> {
  const o = await db
    .prepare(
      `SELECT o.id, o.state, o.amount_cents, o.created_at, o.buyer_email, o.shipping_json, o.carrier, o.tracking_number, c.lines_json, c.shipping_cents
       FROM orders o JOIN carts c ON c.id = o.cart_id WHERE o.id = ? AND o.store_id = ? AND o.state IN ('captured','shipped','refunded')`,
    )
    .bind(id, store)
    .first<{ id: string; state: OrderState; amount_cents: number; created_at: string; buyer_email: string | null; shipping_json: string | null; carrier: string | null; tracking_number: string | null; lines_json: string; shipping_cents: number }>();
  if (!o) return null;
  const [rr, ev] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, state, reason, amount_cents FROM refund_requests WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").bind(id),
    db.prepare("SELECT created_at, actor, type FROM events WHERE order_id = ? ORDER BY created_at, id").bind(id),
  ]);
  const r = rr?.results[0] as { id: string; state: RefundState; reason: string; amount_cents: number } | undefined;
  const lines = linesSchema.parse(JSON.parse(o.lines_json));
  return {
    id: o.id, state: o.state, amountCents: cents(o.amount_cents), createdAt: o.created_at, shippingCents: cents(o.shipping_cents),
    lineTitles: lines.map((l) => l.title),
    lines: lines.map((l) => ({ title: l.title, options: l.options, quantity: l.quantity, lineTotalCents: l.lineTotalCents })),
    buyerEmail: o.buyer_email, shipTo: shipToLine(o.shipping_json),
    tracking: o.carrier && o.tracking_number ? { carrier: o.carrier, number: o.tracking_number } : null,
    refundRequest: r ? { id: r.id, state: r.state, reason: r.reason, amountCents: cents(r.amount_cents) } : null,
    events: ((ev?.results ?? []) as { created_at: string; actor: string; type: string }[]).map((e) => ({ at: e.created_at, actor: e.actor, type: e.type })),
  };
}

export const trackingInput = z.object({ carrier: z.string().trim().min(2).max(40), number: z.string().trim().min(4).max(60).regex(/^[A-Za-z0-9 -]+$/) });

// T-ORD-04: PayPal accepts the tracking, then the order is Shipped. A refusal changes nothing (FC-SEL-04-01).
export async function addTracking(deps: SellerOrderDeps, store: StoreId, id: string, body: unknown): Promise<Result<SellerOrderDetail, DomainError>> {
  const p = trackingInput.safeParse(body);
  if (!p.success) return err(domainError("request.invalid", "tracking"));
  const o = await deps.db
    .prepare("SELECT id, state, paypal_order_id, capture_id FROM orders WHERE id = ? AND store_id = ?")
    .bind(id, store)
    .first<{ id: string; state: OrderState; paypal_order_id: string; capture_id: string | null }>();
  if (!o) return err(domainError("not_found", "order"));
  if (!orderMachine.canMove(o.state, "shipped", "seller") || !o.capture_id) return err(domainError("request.invalid", `order is ${o.state}`));
  const number = p.data.number.replace(/\s+/g, " ");
  const sent = await deps.paypal.addTracking({
    paypalOrderId: asPayPalOrderId(o.paypal_order_id), captureId: asCaptureId(o.capture_id), carrier: p.data.carrier.toUpperCase().replace(/\s+/g, "_"), trackingNumber: number.replace(/\s/g, ""),
    requestId: requestKeys.track(asOrderId(o.id), number),
  });
  if (!sent.ok) return err(domainError("paypal.tracking_refused", sent.error.detail));
  const now = new Date(deps.ids.now()).toISOString();
  await deps.db.batch([
    deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'seller', 'order.shipped', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND state = 'captured')")
      .bind(prefixedId("evt", deps.ids), id, JSON.stringify({ carrier: p.data.carrier }), now, id),
    deps.db.prepare("UPDATE orders SET state = 'shipped', carrier = ?, tracking_number = ?, version = version + 1, updated_at = ? WHERE id = ? AND state = 'captured'").bind(p.data.carrier, number, now, id),
  ]);
  return ok((await sellerOrder(deps.db, store, id))!);
}

interface RefundJoin { id: string; state: RefundState; amount_cents: number; order_id: string; ostate: OrderState; ototal: number; refunded: number; capture_id: string | null }
async function refundRow(db: D1Database, store: StoreId, id: string): Promise<RefundJoin | null> {
  return db
    .prepare(
      `SELECT r.id, r.state, r.amount_cents, r.order_id, o.state AS ostate, o.amount_cents AS ototal, o.refunded_cents AS refunded, o.capture_id
       FROM refund_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = ? AND o.store_id = ?`,
    )
    .bind(id, store)
    .first<RefundJoin>();
}

export type RefundResult = { readonly state: RefundState; readonly message?: string };

// T-RFD-02 then the PayPal refund (INV-05: only this seller action approves). Two phases (CQ-28): the
// approval is committed first; the PayPal call carries refund:{request} so a retry refunds once (SYS-PAY-03).
export async function approveRefund(deps: SellerOrderDeps, store: StoreId, id: string): Promise<Result<RefundResult, DomainError>> {
  const r = await refundRow(deps.db, store, id);
  if (!r) return err(domainError("not_found", "refund request"));
  const evt = () => prefixedId("evt", deps.ids);
  const now = () => new Date(deps.ids.now()).toISOString();
  switch (r.state) {
    case "pending": {
      if (!refundMachine.canMove("pending", "approved", "seller")) return err(domainError("server.error", "machine"));
      await deps.db.batch([
        deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'seller', 'refund.approved', '{}', ? WHERE EXISTS (SELECT 1 FROM refund_requests WHERE id = ? AND state = 'pending')")
          .bind(evt(), r.order_id, now(), id),
        deps.db.prepare("UPDATE refund_requests SET state = 'approved', decided_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'").bind(now(), now(), id),
      ]);
      break;
    }
    case "approved":
      // A retry after PayPal refused or did not answer: same request id, so PayPal refunds once.
      break;
    case "done":
    case "declined":
    case "failed":
      return ok({ state: r.state });
    default:
      return assertNever(r.state);
  }
  const amount = checkRefundAmount({ state: r.ostate, amountCents: cents(r.ototal), refundedCents: cents(r.refunded) }, cents(r.amount_cents));
  if (!amount.ok) return amount;
  if (!r.capture_id) return err(domainError("server.error", "captured order without capture id"));
  const paid = await deps.paypal.refund(r.capture_id, amount.value, requestKeys.refund(refundRequestId(id)));
  if (!paid.ok) return ok({ state: "approved", message: `PayPal didn't refund this order: ${paid.error.paypalName ?? paid.error.detail ?? "no answer"}.` });
  switch (paid.value.status) {
    case "COMPLETED": {
      const full = r.refunded + amount.value >= r.ototal;
      await deps.db.batch([
        deps.db.prepare("UPDATE refund_requests SET state = 'done', paypal_refund_id = ?, updated_at = ? WHERE id = ? AND state = 'approved'").bind(paid.value.paypalRefundId, now(), id),
        deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) VALUES (?, ?, 'paypal', 'refund.done', ?, ?)").bind(evt(), r.order_id, JSON.stringify({ amount_cents: amount.value }), now()),
        ...(full
          ? [
              deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'paypal', 'order.refunded', '{}', ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND state IN ('captured','shipped'))")
                .bind(evt(), r.order_id, now(), r.order_id),
              deps.db.prepare("UPDATE orders SET state = 'refunded', refunded_cents = amount_cents, version = version + 1, updated_at = ? WHERE id = ? AND state IN ('captured','shipped')").bind(now(), r.order_id),
            ]
          : [deps.db.prepare("UPDATE orders SET refunded_cents = refunded_cents + ?, updated_at = ? WHERE id = ?").bind(amount.value, now(), r.order_id)]),
      ]);
      return ok({ state: "done" });
    }
    case "PENDING":
      // PayPal finishes it later; the PAYMENT.CAPTURE.REFUNDED webhook moves it to Done.
      await deps.db.prepare("UPDATE refund_requests SET paypal_refund_id = ?, updated_at = ? WHERE id = ?").bind(paid.value.paypalRefundId, now(), id).run();
      return ok({ state: "approved", message: "PayPal is finishing the refund." });
    case "FAILED":
    case "CANCELLED":
      await deps.db.batch([
        deps.db.prepare("UPDATE refund_requests SET state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND state = 'approved'").bind(`PayPal ${paid.value.status}`, now(), id),
        deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) VALUES (?, ?, 'paypal', 'refund.failed', '{}', ?)").bind(evt(), r.order_id, now()),
      ]);
      return ok({ state: "failed", message: `PayPal didn't refund this order: ${paid.value.status.toLowerCase()}.` });
    default:
      return assertNever(paid.value.status);
  }
}

export const declineInput = z.object({ reason: z.string().trim().min(1).max(300) });

// T-RFD-03: the seller declines with a reason the buyer sees (AC-BUY-05-03).
export async function declineRefund(deps: SellerOrderDeps, store: StoreId, id: string, body: unknown): Promise<Result<RefundResult, DomainError>> {
  const p = declineInput.safeParse(body);
  if (!p.success) return err(domainError("request.invalid", "reason"));
  const r = await refundRow(deps.db, store, id);
  if (!r) return err(domainError("not_found", "refund request"));
  if (!refundMachine.canMove(r.state, "declined", "seller")) return err(domainError("request.invalid", `request is ${r.state}`));
  const now = new Date(deps.ids.now()).toISOString();
  await deps.db.batch([
    deps.db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'seller', 'refund.declined', '{}', ? WHERE EXISTS (SELECT 1 FROM refund_requests WHERE id = ? AND state = 'pending')")
      .bind(prefixedId("evt", deps.ids), r.order_id, now, id),
    deps.db.prepare("UPDATE refund_requests SET state = 'declined', decline_reason = ?, decided_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'").bind(p.data.reason, now, now, id),
  ]);
  return ok({ state: "declined" });
}
