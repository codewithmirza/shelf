import { beforeEach, describe, expect, it } from "vitest";
import { cents, paypalOrderId, captureId } from "@/server/domain/brand";
import { paypalCall, resetTokenCacheForTests, type PayPalDeps, MAX_RETRIES } from "@/server/paypal/http";
import { captureOrder, createOrder, getOrder } from "@/server/paypal/orders";
import { refundCapture } from "@/server/paypal/refunds";
import { verifyWebhook } from "@/server/paypal/webhooks";
import { z } from "zod";

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const token = () => json(200, { access_token: "tok", expires_in: 3600 });

function fakeDeps(script: Array<Response | Error>): { deps: PayPalDeps; calls: Call[]; sleeps: number[] } {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const queue = [...script];
  const deps: PayPalDeps = {
    fetch: async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      const next = queue.shift();
      if (!next) throw new Error("no scripted response");
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms) => { sleeps.push(ms); },
    baseUrl: "https://api-m.sandbox.paypal.com",
    clientId: "id",
    clientSecret: "secret",
  };
  return { deps, calls, sleeps };
}

const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);
const orderBody = { id: "5O190127TN364715T", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O19" }] };

beforeEach(() => resetTokenCacheForTests());

describe("PayPal client", () => {
  it("TC-PAY-01 (unit): create order sends server totals, payee and PayPal-Request-Id", async () => {
    const { deps, calls } = fakeDeps([token(), json(201, orderBody)]);
    const res = await createOrder(deps, {
      cartId: "CART-ABCDEFGHJKLM", payeeEmail: "maya@example.com", storeName: "Maya Mugs",
      lines: [{ name: "Speckled mug", sku: "MUG-S", quantity: 2, unitPriceCents: cents(2400) }],
      subtotalCents: cents(4800), shippingCents: cents(600), totalCents: cents(5400),
      returnUrl: "https://shelf.test/pay/return", cancelUrl: "https://shelf.test/pay/cancel", requestId: "order:CART-ABCDEFGHJKLM:v1",
    });
    expect(res.ok && res.value.approveUrl).toContain("checkoutnow");
    const call = calls[1]!;
    expect(header(call, "paypal-request-id")).toBe("order:CART-ABCDEFGHJKLM:v1");
    const body = JSON.parse(String(call.init.body));
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "54.00", breakdown: { item_total: { currency_code: "USD", value: "48.00" }, shipping: { currency_code: "USD", value: "6.00" } } });
    expect(body.purchase_units[0].payee).toEqual({ email_address: "maya@example.com" });
  });

  it("CQ-29: retries a 503 with the same request id, then succeeds", async () => {
    const { deps, calls, sleeps } = fakeDeps([token(), json(503, {}), json(201, { id: "X", status: "COMPLETED" })]);
    const res = await captureOrder(deps, paypalOrderId("X"), "capture:ord_1");
    expect(res.ok).toBe(true);
    expect(calls.slice(1).map((c) => header(c, "paypal-request-id"))).toEqual(["capture:ord_1", "capture:ord_1"]);
    expect(sleeps).toHaveLength(1);
  });

  it("CQ-29: stops after MAX_RETRIES and reports paypal.unavailable", async () => {
    const { deps, calls } = fakeDeps([token(), json(500, {}), json(502, {}), json(503, {})]);
    const res = await paypalCall(deps, { method: "GET", path: "/v2/x", schema: z.unknown() });
    expect(res.ok ? null : res.error.code).toBe("paypal.unavailable");
    expect(calls.length - 1).toBe(MAX_RETRIES + 1);
  });

  it("CQ-29: never retries a 4xx and keeps PayPal's error name for logs", async () => {
    const { deps, calls } = fakeDeps([token(), json(422, { name: "UNPROCESSABLE_ENTITY" })]);
    const res = await captureOrder(deps, paypalOrderId("X"), "capture:ord_1");
    expect(calls).toHaveLength(2);
    expect(res.ok ? null : [res.error.code, res.error.paypalName]).toEqual(["paypal.refused", "UNPROCESSABLE_ENTITY"]);
  });

  it("CQ-29: a timeout on every attempt maps to upstream.timeout", async () => {
    const t = () => new DOMException("timed out", "TimeoutError");
    const { deps } = fakeDeps([token(), t(), t(), t()]);
    const res = await paypalCall(deps, { method: "GET", path: "/v2/x", schema: z.unknown() });
    expect(res.ok ? null : res.error.code).toBe("upstream.timeout");
  });

  it("CQ-21: an answer of the wrong shape is an error, not a crash", async () => {
    const { deps } = fakeDeps([token(), json(200, { id: 1 })]);
    const res = await getOrder(deps, paypalOrderId("X"));
    expect(res.ok ? null : res.error.code).toBe("paypal.unavailable");
  });

  it("caches the OAuth token across calls", async () => {
    const { deps, calls } = fakeDeps([token(), json(200, { id: "X", status: "APPROVED" }), json(200, { id: "X", status: "APPROVED" })]);
    await getOrder(deps, paypalOrderId("X"));
    await getOrder(deps, paypalOrderId("X"));
    expect(calls.filter((c) => c.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("reads the capture amount in cents from a completed order", async () => {
    const { deps } = fakeDeps([token(), json(200, { id: "X", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "54.00" } }] } }] })]);
    const res = await getOrder(deps, paypalOrderId("X"));
    expect(res.ok && res.value.capture).toEqual({ id: "CAP1", amountCents: 5400, status: "COMPLETED" });
  });

  it("TC-PAY-07 (unit): refund sends the amount and the refund request id", async () => {
    const { deps, calls } = fakeDeps([token(), json(201, { id: "R1", status: "COMPLETED" })]);
    const res = await refundCapture(deps, captureId("CAP1"), cents(1250), "refund:rfd_1");
    expect(res.ok && res.value).toEqual({ paypalRefundId: "R1", status: "COMPLETED" });
    expect(header(calls[1]!, "paypal-request-id")).toBe("refund:rfd_1");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ amount: { currency_code: "USD", value: "12.50" } });
  });

  it("TC-PAY-04 (unit): a webhook without transmission headers is refused before any call", async () => {
    const { deps, calls } = fakeDeps([]);
    const res = await verifyWebhook(deps, "WH1", new Headers(), { id: "E1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("TC-PAY-04 (unit): FAILURE from PayPal refuses the webhook", async () => {
    const { deps } = fakeDeps([token(), json(200, { verification_status: "FAILURE" })]);
    const h = new Headers({ "paypal-auth-algo": "a", "paypal-cert-url": "c", "paypal-transmission-id": "t", "paypal-transmission-sig": "s", "paypal-transmission-time": "now" });
    const res = await verifyWebhook(deps, "WH1", h, { id: "E1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} });
    expect(res.ok).toBe(false);
  });
});
