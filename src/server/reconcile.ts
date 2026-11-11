import type { DomainError } from "./domain/errors";
import { prefixedId } from "./domain/ids";
import { orderMachine, type OrderState } from "./domain/machines";
import { assertNever, err, ok, type Result } from "./domain/result";
import { captureOrderOnce, type CheckoutDeps, type OrderRow } from "./checkout";
import type { OrderSnapshot } from "./paypal/orders";

// What one sync did. "none" means Shelf already agreed with PayPal.
export type SyncOutcome = { readonly kind: "none" } | { readonly kind: "moved"; readonly to: OrderState };

// T-ORD-06 after 3 hours with no capture (T-CRT-06 follows for the cart).
export const CANCEL_AFTER_MS = 3 * 60 * 60 * 1000;
// SYS-PAY-09: read PayPal for orders open for more than 10 minutes.
export const STALE_AFTER_MS = 10 * 60 * 1000;

const isFinal = (s: OrderState) => s === "captured" || s === "shipped" || s === "refunded" || s === "cancelled";

// The one place that makes Shelf agree with PayPal. The webhook and the scheduled job both call it,
// so both paths lead to the same state (Gate 5 "PayPal webhooks", CQ-31). Every move goes through SM-ORD.
export async function syncFromPayPal(deps: CheckoutDeps, order: OrderRow, snap: OrderSnapshot): Promise<Result<SyncOutcome, DomainError>> {
  const now = new Date(deps.ids.now()).toISOString();
  const evt = () => prefixedId("evt", deps.ids);
  const moved = (to: OrderState): Result<SyncOutcome, DomainError> => ok({ kind: "moved", to });
  const capture = snap.capture;

  // Money moved back: the capture shows REFUNDED (R1 refunds are full only).
  if (capture?.status === "REFUNDED") {
    if (!orderMachine.canMove(order.state, "refunded", "paypal")) return ok({ kind: "none" });
    return (await deps.orders.markRefunded(order, evt(), now)) ? moved("refunded") : ok({ kind: "none" });
  }
  if (capture && (capture.status === "DECLINED" || capture.status === "FAILED")) {
    if (!orderMachine.canMove(order.state, "cancelled", "paypal")) return ok({ kind: "none" });
    return (await deps.orders.markCancelled(order, "capture declined", evt(), now)) ? moved("cancelled") : ok({ kind: "none" });
  }

  switch (snap.status) {
    case "COMPLETED": {
      // Captured at PayPal; record it with the same guarded batch as the Pay page.
      if (isFinal(order.state)) return ok({ kind: "none" });
      const r = await captureOrderOnce(deps, order);
      return r.ok ? (r.value === order.state ? ok({ kind: "none" }) : moved(r.value)) : err(r.error);
    }
    case "APPROVED": {
      // The buyer approved but nobody captured (closed the Pay page). Capture is what they approved.
      if (isFinal(order.state)) return ok({ kind: "none" });
      if (order.state === "created") await deps.orders.markApproved(order, evt(), now);
      const r = await captureOrderOnce(deps, { ...order, state: "approved" });
      return r.ok ? moved(r.value) : err(r.error);
    }
    case "VOIDED": {
      if (!orderMachine.canMove(order.state, "cancelled", "paypal")) return ok({ kind: "none" });
      return (await deps.orders.markCancelled(order, "voided at PayPal", evt(), now)) ? moved("cancelled") : ok({ kind: "none" });
    }
    case "CREATED":
    case "SAVED":
    case "PAYER_ACTION_REQUIRED":
      return ok({ kind: "none" });
    default:
      return assertNever(snap.status);
  }
}

export interface ReconcileReport {
  readonly read: number;
  readonly moved: number;
  readonly cancelled: number;
  readonly failed: number;
  readonly cartsExpired: number;
}

// Every 5 minutes (cron in wrangler.jsonc). Reads PayPal for open orders older than 10 minutes, cancels
// orders with no capture after 3 hours, and expires old carts.
export async function reconcile(deps: CheckoutDeps, limit = 25): Promise<ReconcileReport> {
  const nowMs = deps.ids.now().getTime();
  const stale = await deps.orders.listStale(new Date(nowMs - STALE_AFTER_MS).toISOString(), limit);
  let moved = 0, cancelled = 0, failed = 0;
  for (const order of stale) {
    const snap = await deps.payments.getOrder(order.paypalOrderId);
    if (!snap.ok) { failed++; continue; }
    const r = await syncFromPayPal(deps, order, snap.value);
    if (!r.ok) { failed++; continue; }
    if (r.value.kind === "moved") { moved++; continue; }
    if (nowMs - Date.parse(order.createdAt) >= CANCEL_AFTER_MS && orderMachine.canMove(order.state, "cancelled", "system")) {
      if (await deps.orders.markCancelled(order, "no capture after 3 hours", prefixedId("evt", deps.ids), new Date(nowMs).toISOString())) cancelled++;
    }
  }
  const cartsExpired = await deps.orders.expireCarts(new Date(nowMs).toISOString());
  return { read: stale.length, moved, cancelled, failed, cartsExpired };
}
