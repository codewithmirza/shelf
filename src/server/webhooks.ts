import { paypalOrderId } from "./domain/brand";
import { domainError, type DomainError } from "./domain/errors";
import { err, ok, type Result } from "./domain/result";
import type { CheckoutDeps } from "./checkout";
import { syncFromPayPal, type SyncOutcome } from "./reconcile";
import { WEBHOOK_EVENT_TYPES, webhookEventSchema, type WebhookEvent } from "./paypal/webhooks";

export interface WebhookRepo {
  seen(eventId: string): Promise<boolean>;
  // INSERT OR IGNORE on webhook_events (INV-08).
  record(event: WebhookEvent, resourceId: string | null, now: string): Promise<void>;
}

export interface WebhookDeps extends CheckoutDeps {
  readonly webhooks: WebhookRepo;
  // PayPal's verify-webhook-signature call (SYS-PAY-04).
  verify(headers: Headers, event: WebhookEvent): Promise<Result<true, DomainError>>;
}

export type WebhookOutcome =
  | { readonly kind: "ignored"; readonly reason: "duplicate" | "event type" | "unknown order" }
  | { readonly kind: "applied"; readonly sync: SyncOutcome };

// The PayPal order a webhook is about. Checkout events carry it as resource.id; capture and refund
// events carry it in supplementary_data.related_ids.order_id.
export function paypalOrderIdOf(event: WebhookEvent): string | null {
  const r = event.resource as { id?: unknown; supplementary_data?: { related_ids?: { order_id?: unknown } } };
  if (event.event_type.startsWith("CHECKOUT.ORDER.")) return typeof r.id === "string" ? r.id : null;
  const related = r.supplementary_data?.related_ids?.order_id;
  return typeof related === "string" ? related : null;
}

// POST /api/webhooks/paypal. A webhook is a hint (CQ-31): after the signature check, Shelf reads the
// order from PayPal and applies that truth, never the webhook body. The event is recorded after it is
// applied, so a failure lets PayPal deliver it again; applying twice is safe because every write is guarded.
export async function handleWebhook(deps: WebhookDeps, headers: Headers, rawBody: string): Promise<Result<WebhookOutcome, DomainError>> {
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(rawBody); } catch { return err(domainError("request.invalid", "body")); }
  const parsed = webhookEventSchema.safeParse(parsedJson);
  if (!parsed.success) return err(domainError("request.invalid", "event shape"));
  const event = parsed.data;

  const verified = await deps.verify(headers, event);
  if (!verified.ok) return verified;

  if (await deps.webhooks.seen(event.id)) return ok({ kind: "ignored", reason: "duplicate" });
  const now = new Date(deps.ids.now()).toISOString();
  const ppId = paypalOrderIdOf(event);

  if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(event.event_type)) {
    await deps.webhooks.record(event, ppId, now);
    return ok({ kind: "ignored", reason: "event type" });
  }
  const order = ppId ? await deps.orders.byPayPalId(paypalOrderId(ppId)) : null;
  if (!order) {
    await deps.webhooks.record(event, ppId, now);
    return ok({ kind: "ignored", reason: "unknown order" });
  }
  const snap = await deps.payments.getOrder(order.paypalOrderId);
  if (!snap.ok) return err({ code: snap.error.code, ...(snap.error.detail ? { detail: snap.error.detail } : {}) });
  const sync = await syncFromPayPal(deps, order, snap.value);
  if (!sync.ok) return sync;
  await deps.webhooks.record(event, ppId, now);
  return ok({ kind: "applied", sync: sync.value });
}

export function d1WebhookRepo(db: D1Database): WebhookRepo {
  return {
    async seen(id) {
      return (await db.prepare("SELECT 1 AS x FROM webhook_events WHERE paypal_event_id = ?").bind(id).first()) !== null;
    },
    async record(event, resourceId, now) {
      await db.prepare("INSERT OR IGNORE INTO webhook_events (paypal_event_id, event_type, resource_id, received_at) VALUES (?, ?, ?, ?)").bind(event.id, event.event_type, resourceId, now).run();
    },
  };
}
