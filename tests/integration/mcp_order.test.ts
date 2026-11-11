import { describe, expect, it } from "vitest";
import { variantId } from "@/server/domain/brand";
import { d1CartRepo, upsertCart } from "@/server/carts";
import { capturePayment, d1OrderRepo, startCheckout, type CheckoutDeps } from "@/server/checkout";
import { d1OrderStatusRepo, type OrderDeps } from "@/server/orders";
import { d1Catalog } from "@/server/catalog";
import type { ShelfMcpDeps } from "@/server/mcp/server";
import { rpc } from "./mcp_surface.test";
import { sqliteD1 } from "../support/d1";
import { TOKEN_SECRET, fakeIds, fakePayPal } from "../support/fakes";

// get_order_status and request_refund over MCP, on the real schema.
async function paidOrder() {
  const db = sqliteD1(true);
  const ids = fakeIds();
  const paypal = fakePayPal();
  const checkout: CheckoutDeps = { carts: d1CartRepo(db), orders: d1OrderRepo(db), payments: paypal, ids, tokenSecret: TOKEN_SECRET, origin: "https://shelf.test" };
  const orders: OrderDeps = { repo: d1OrderStatusRepo(db), ids, tokenSecret: TOKEN_SECRET };
  const deps: ShelfMcpDeps = { catalog: d1Catalog(db), carts: { repo: checkout.carts, ids }, checkout, orders, origin: "https://shelf.test", version: "0.1.0" };
  const cart = await upsertCart({ repo: checkout.carts, ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId("var_demo_mug_s"), quantity: 1 }], channel: "storefront", actor: "buyer" });
  if (!cart.ok) throw new Error("cart");
  const link = await startCheckout(checkout, cart.value.cart.id);
  if (!link.ok) throw new Error(link.error.code);
  const pay = decodeURIComponent(new URL(link.value.payUrl).searchParams.get("t")!);
  const call = (name: string, args: Record<string, unknown>) => rpc(deps, "tools/call", { name, arguments: { order_id: link.value.order.id, order_token: link.value.orderToken, ...args } });
  const capture = async () => { paypal.approve(link.value.order.paypalOrderId); ids.advance(2000); return capturePayment(checkout, link.value.order.id, pay); };
  return { db, ids, link: link.value, call, capture };
}

describe("Order tools (T-12)", () => {
  it("TC-MCP-04: get_order_status returns state, lines and a timeline; text matches", async () => {
    const o = await paidOrder();
    const before = await o.call("get_order_status", {});
    expect(before.result.structuredContent.order.state).toBe("created");
    expect(before.result.content[0].text).toContain("Waiting for payment");
    await o.capture();
    const r = await o.call("get_order_status", {});
    const view = r.result.structuredContent.order;
    expect(view).toMatchObject({ state: "captured", store: "Maya Mugs", total: { value: "30.00" }, tracking: null, refund_request: null });
    expect(view.timeline.map((t: { text: string }) => t.text)).toEqual(["Order created", "Paid"]);
    expect(r.result.content[0].text).toBe(`Order ${o.link.order.id} at Maya Mugs: Paid, $30.00.`);
  });

  it("TC-SEC-02 / AC-BUY-04-02: a wrong token answers not found; nothing private leaks", async () => {
    const o = await paidOrder();
    await o.capture();
    const r = await o.call("get_order_status", { order_token: "v1.AAAA.BBBB" });
    expect(r.result.structuredContent.error.code).toBe("not_found");
    const ok = JSON.stringify((await o.call("get_order_status", {})).result);
    expect(ok).not.toContain("ben@sandbox.test");
    expect(ok).not.toContain("country_code");
    expect(ok).not.toContain(o.link.order.paypalOrderId);
  });

  it("TC-MCP-05: a refund request is pending; a second ask returns the first; one event", async () => {
    const o = await paidOrder();
    await o.capture();
    const first = await o.call("request_refund", { reason: "It arrived cracked." });
    expect(first.result.structuredContent.order.refund_request).toEqual({ state: "pending", decline_reason: null });
    expect(first.result.content[0].text).toContain("Refund: Waiting for the seller.");
    const second = await o.call("request_refund", { reason: "Again" });
    expect(second.result.structuredContent.order.refund_request.state).toBe("pending");
    const rows = (await o.db.prepare("SELECT COUNT(*) AS n FROM refund_requests").first<{ n: number }>())!;
    expect(rows.n).toBe(1);
    const events = (await o.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'refund.requested'").first<{ n: number }>())!;
    expect(events.n).toBe(1);
  });

  it("INV-06 at the database: a racing second pending insert is refused by the unique index", async () => {
    const o = await paidOrder();
    await o.capture();
    const repo = d1OrderStatusRepo(o.db);
    const base = { orderId: o.link.order.id, reason: "x", amountCents: 3000 as never, now: "2026-11-11T10:00:00Z" };
    expect(await repo.createRefundRequest({ ...base, requestId: "rfd_A", eventId: "evt_A" })).toBe("created");
    expect(await repo.createRefundRequest({ ...base, requestId: "rfd_B", eventId: "evt_B" })).toBe("exists");
  });

  it("an unpaid order cannot be refunded", async () => {
    const o = await paidOrder();
    const r = await o.call("request_refund", { reason: "changed my mind" });
    expect(r.result.structuredContent.error.code).toBe("refund.not_allowed");
  });
});
