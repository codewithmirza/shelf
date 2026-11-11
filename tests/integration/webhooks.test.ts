import { describe, expect, it } from "vitest";
import { variantId } from "@/server/domain/brand";
import { domainError } from "@/server/domain/errors";
import { err, ok } from "@/server/domain/result";
import { startCheckout } from "@/server/checkout";
import { upsertCart } from "@/server/carts";
import { CANCEL_AFTER_MS, STALE_AFTER_MS, reconcile } from "@/server/reconcile";
import { handleWebhook, paypalOrderIdOf, type WebhookDeps, type WebhookRepo } from "@/server/webhooks";
import { testWorld } from "../support/fakes";

function world(signatureOk = true) {
  const w = testWorld();
  const seen = new Set<string>();
  const webhooks: WebhookRepo = { async seen(id) { return seen.has(id); }, async record(e) { seen.add(e.id); } };
  let verifyCalls = 0;
  const deps: WebhookDeps = {
    ...w.checkout,
    webhooks,
    async verify() { verifyCalls++; return signatureOk ? ok(true) : err(domainError("request.invalid", "signature")); },
  };
  return { ...w, deps, seen, verifyCalls: () => verifyCalls };
}

async function openOrder(w: ReturnType<typeof world>) {
  const cart = await upsertCart({ repo: w.repo, ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId("var_s"), quantity: 1 }], channel: "storefront", actor: "buyer" });
  if (!cart.ok) throw new Error("cart");
  const link = await startCheckout(w.checkout, cart.value.cart.id);
  if (!link.ok) throw new Error(link.error.code);
  return link.value.order;
}

const captureEvent = (id: string, ppOrder: string) =>
  JSON.stringify({ id, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: `CAP-${ppOrder}`, status: "COMPLETED", supplementary_data: { related_ids: { order_id: ppOrder } } } });

describe("Webhooks (TC-PAY-04)", () => {
  it("TC-PAY-04: a signed capture webhook applies once; the replay changes nothing", async () => {
    const w = world();
    const order = await openOrder(w);
    w.paypal.captureAtPayPal(order.paypalOrderId);
    const first = await handleWebhook(w.deps, new Headers(), captureEvent("WH-1", order.paypalOrderId));
    expect(first).toEqual({ ok: true, value: { kind: "applied", sync: { kind: "moved", to: "captured" } } });
    const replay = await handleWebhook(w.deps, new Headers(), captureEvent("WH-1", order.paypalOrderId));
    expect(replay).toEqual({ ok: true, value: { kind: "ignored", reason: "duplicate" } });
    expect(w.orders.events.filter((e) => e.type === "order.captured")).toHaveLength(1);
    expect(w.orders.orders.get(order.id)!.state).toBe("captured");
  });

  it("TC-PAY-04: a bad signature changes nothing and is not recorded", async () => {
    const w = world(false);
    const order = await openOrder(w);
    w.paypal.captureAtPayPal(order.paypalOrderId);
    const r = await handleWebhook(w.deps, new Headers(), captureEvent("WH-2", order.paypalOrderId));
    expect(r.ok ? null : r.error.code).toBe("request.invalid");
    expect(w.orders.orders.get(order.id)!.state).toBe("created");
    expect(w.seen.size).toBe(0);
  });

  it("CQ-31: the webhook body is a hint; Shelf applies what PayPal says", async () => {
    const w = world();
    const order = await openOrder(w);
    // The body claims a capture, but PayPal says the buyer has not paid.
    const r = await handleWebhook(w.deps, new Headers(), captureEvent("WH-3", order.paypalOrderId));
    expect(r).toEqual({ ok: true, value: { kind: "applied", sync: { kind: "none" } } });
    expect(w.orders.orders.get(order.id)!.state).toBe("created");
  });

  it("CHECKOUT.ORDER.APPROVED captures the order the buyer approved", async () => {
    const w = world();
    const order = await openOrder(w);
    w.paypal.approve(order.paypalOrderId);
    const r = await handleWebhook(w.deps, new Headers(), JSON.stringify({ id: "WH-4", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: order.paypalOrderId, status: "APPROVED" } }));
    expect(r.ok && r.value).toEqual({ kind: "applied", sync: { kind: "moved", to: "captured" } });
    expect(w.orders.events.map((e) => e.type)).toEqual(["order.created", "order.approved", "order.captured"]);
  });

  it("CHECKOUT.ORDER.VOIDED cancels and frees the cart", async () => {
    const w = world();
    const order = await openOrder(w);
    w.paypal.void(order.paypalOrderId);
    await handleWebhook(w.deps, new Headers(), JSON.stringify({ id: "WH-5", event_type: "CHECKOUT.ORDER.VOIDED", resource: { id: order.paypalOrderId } }));
    expect(w.orders.orders.get(order.id)!.state).toBe("cancelled");
    expect(w.repo.carts.get(order.cartId)!.state).toBe("expired");
  });

  it("PAYMENT.CAPTURE.REFUNDED moves a captured order to refunded", async () => {
    const w = world();
    const order = await openOrder(w);
    w.paypal.captureAtPayPal(order.paypalOrderId);
    await handleWebhook(w.deps, new Headers(), captureEvent("WH-6", order.paypalOrderId));
    w.paypal.refund(order.paypalOrderId);
    const r = await handleWebhook(w.deps, new Headers(), JSON.stringify({ id: "WH-7", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R1", supplementary_data: { related_ids: { order_id: order.paypalOrderId } } } }));
    expect(r.ok && r.value).toEqual({ kind: "applied", sync: { kind: "moved", to: "refunded" } });
  });

  it("unknown orders and event types are recorded and ignored; a bad body is refused before verification", async () => {
    const w = world();
    expect((await handleWebhook(w.deps, new Headers(), captureEvent("WH-8", "PP-NOPE"))).ok && true).toBe(true);
    expect(await handleWebhook(w.deps, new Headers(), JSON.stringify({ id: "WH-9", event_type: "BILLING.PLAN.CREATED", resource: {} }))).toEqual({ ok: true, value: { kind: "ignored", reason: "event type" } });
    expect(await handleWebhook(w.deps, new Headers(), "{not json")).toMatchObject({ ok: false, error: { code: "request.invalid" } });
    expect(w.verifyCalls()).toBe(2);
  });

  it("SYS-PAY-04: verification gets the event exactly as PayPal sent it, unknown fields included", async () => {
    const w = world();
    let seen: unknown = null;
    w.deps.verify = async (_h, original) => { seen = original; return ok(true); };
    const body = { id: "WH-RAW", event_type: "PAYMENT.CAPTURE.COMPLETED", create_time: "2026-11-11T10:00:00Z", summary: "Payment completed", links: [{ rel: "self" }], resource: { id: "C", extra: 1 } };
    await handleWebhook(w.deps, new Headers(), JSON.stringify(body));
    expect(seen).toEqual(body);
  });

  it("finds the PayPal order id in both event families", () => {
    expect(paypalOrderIdOf({ id: "e", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "PP1" } })).toBe("PP1");
    expect(paypalOrderIdOf({ id: "e", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", supplementary_data: { related_ids: { order_id: "PP2" } } } })).toBe("PP2");
  });
});

describe("Reconciler (TC-PAY-09)", () => {
  it("TC-PAY-09: an approved order older than 10 minutes is captured from PayPal's truth", async () => {
    const w = world();
    const order = await openOrder(w);
    w.paypal.approve(order.paypalOrderId);
    w.ids.advance(STALE_AFTER_MS - 1000);
    expect((await reconcile(w.checkout)).read).toBe(0);
    w.ids.advance(2000);
    const report = await reconcile(w.checkout);
    expect(report).toMatchObject({ read: 1, moved: 1, failed: 0 });
    expect(w.orders.orders.get(order.id)!.state).toBe("captured");
  });

  it("T-ORD-06: an unpaid order is cancelled after 3 hours and its cart expires", async () => {
    const w = world();
    const order = await openOrder(w);
    w.ids.advance(CANCEL_AFTER_MS);
    const report = await reconcile(w.checkout);
    expect(report).toMatchObject({ read: 1, moved: 0, cancelled: 1 });
    expect(w.orders.orders.get(order.id)!.state).toBe("cancelled");
    expect(w.repo.carts.get(order.cartId)!.state).toBe("expired");
  });

  it("T-CRT-06: an idle cart expires; a paid one does not", async () => {
    const w = world();
    const idle = await upsertCart({ repo: w.repo, ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [], channel: "storefront", actor: "buyer" });
    const paid = await openOrder(w);
    w.paypal.captureAtPayPal(paid.paypalOrderId);
    await handleWebhook(w.deps, new Headers(), captureEvent("WH-10", paid.paypalOrderId));
    w.ids.advance(CANCEL_AFTER_MS + 1);
    const report = await reconcile(w.checkout);
    expect(report.cartsExpired).toBe(1);
    expect(w.repo.carts.get(idle.ok ? idle.value.cart.id : ("" as never))!.state).toBe("expired");
    expect(w.repo.carts.get(paid.cartId)!.state).toBe("completed");
  });
});
