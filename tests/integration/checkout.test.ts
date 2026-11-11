import { describe, expect, it } from "vitest";
import { cents, variantId } from "@/server/domain/brand";
import { capturePayment, payPage, startCheckout } from "@/server/checkout";
import { upsertCart } from "@/server/carts";
import { rpc } from "./mcp_surface.test";
import { PAYEES, testWorld } from "../support/fakes";

type World = ReturnType<typeof testWorld>;
const cartWith = async (w: World, items: { v: string; q: number }[]) => {
  const r = await upsertCart(w.deps.carts, { cartId: undefined, storeSlug: "maya-mugs", items: items.map((i) => ({ variantId: variantId(i.v), quantity: i.q })), channel: "storefront", actor: "buyer" });
  if (!r.ok) throw new Error(r.error.code);
  return r.value.cart;
};
const tokenOf = (payUrl: string) => decodeURIComponent(new URL(payUrl).searchParams.get("t")!);
const checkout = async (w: World, cartId: string) => {
  const r = await startCheckout(w.checkout, cartId);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("start_checkout (T-10)", () => {
  it("TC-PAY-01 (unit): one PayPal order with the seller as payee and the server total", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 2 }]);
    const r = await rpc(w.deps, "tools/call", { name: "start_checkout", arguments: { cart_id: cart.id } });
    const s = r.result.structuredContent;
    expect(s.view).toBe("checkout");
    expect(s.total).toEqual({ currency_code: "USD", value: "54.00" });
    expect(s.pay_url).toMatch(/^https:\/\/shelf\.test\/pay\/ord_[0-9A-Z]{26}\?t=v1\./);
    const create = w.paypal.calls.filter((c) => c.kind === "create");
    expect(create).toHaveLength(1);
    expect(create[0]!.key).toBe(`order:${cart.id}:v1`);
    expect(create[0]!.input).toMatchObject({ payeeEmail: PAYEES.sto_maya, subtotalCents: 4800, shippingCents: 600, totalCents: 5400 });
    expect(w.repo.carts.get(cart.id)!.state).toBe("checking_out");
    expect(r.result.content[0].text).toContain("Not paid yet");
  });

  it("FC-BUY-03-02: a second tap gives the same order and a new link, with no new PayPal order", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 1 }]);
    const first = await checkout(w, cart.id);
    w.ids.advance(60_000);
    const second = await checkout(w, cart.id);
    expect(second.order.id).toBe(first.order.id);
    expect(second.payUrl).not.toBe(first.payUrl);
    expect(w.paypal.calls.filter((c) => c.kind === "create")).toHaveLength(1);
  });

  it("CQ-28: a crash after PayPal created the order is repaired with the same request id", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 1 }]);
    w.orders.failNextInsert();
    const crashed = await startCheckout(w.checkout, cart.id);
    expect(crashed.ok ? null : crashed.error.code).toBe("server.error");
    const again = await checkout(w, cart.id);
    const keys = w.paypal.calls.filter((c) => c.kind === "create").map((c) => c.key);
    expect(keys).toEqual([`order:${cart.id}:v1`, `order:${cart.id}:v1`]);
    expect(again.order.paypalOrderId).toBe("PP1");
    expect(w.orders.orders.size).toBe(1);
  });

  it("an incomplete cart is refused and the tool shows the latest cart", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_sold", q: 1 }]);
    const r = await rpc(w.deps, "tools/call", { name: "start_checkout", arguments: { cart_id: cart.id } });
    expect(r.result.isError).toBe(true);
    expect(r.result.structuredContent).toMatchObject({ view: "cart", error: { code: "cart.not_ready" } });
    expect(w.paypal.calls).toHaveLength(0);
  });

  it("INV-01: a price change before Pay updates the cart and asks the buyer to look again", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 1 }]);
    const v = w.repo.variantMap.get(variantId("var_s"))!;
    w.repo.variantMap.set(v.id, { ...v, priceCents: cents(2600) });
    const first = await startCheckout(w.checkout, cart.id);
    expect(first.ok ? null : first.error.code).toBe("cart.version_conflict");
    expect(w.repo.carts.get(cart.id)!.totalCents).toBe(3200);
    const second = await checkout(w, cart.id);
    expect(second.order.amountCents).toBe(3200);
    expect(w.paypal.calls[0]!.key).toBe(`order:${cart.id}:v2`);
  });

  it("an unknown cart answers not_found", async () => {
    const r = await startCheckout(testWorld().checkout, "CART-AAAAAAAAAAAA");
    expect(r.ok ? null : r.error.code).toBe("not_found");
  });
});

describe("Pay page and capture (T-10)", () => {
  const ready = async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 3 }]);
    const link = await checkout(w, cart.id);
    return { w, cart, link, token: tokenOf(link.payUrl) };
  };

  it("the Pay page reads the order with its signed link", async () => {
    const { w, link, token } = await ready();
    const r = await payPage(w.checkout, link.order.id, token);
    expect(r.ok && [r.value.order.amountCents, r.value.store.name, r.value.cart.lines.length]).toEqual([7800, "Maya Mugs", 1]);
  });

  it("checkout.not_approved before the buyer approves in PayPal", async () => {
    const { w, link, token } = await ready();
    const r = await capturePayment(w.checkout, link.order.id, token);
    expect(r.ok ? null : r.error.code).toBe("checkout.not_approved");
    expect(w.orders.orders.get(link.order.id)!.state).toBe("created");
  });

  it("TC-PAY-03: two captures, one capture id, the same PayPal-Request-Id, one event", async () => {
    const { w, cart, link, token } = await ready();
    w.paypal.approve(link.order.paypalOrderId);
    const [a, b] = await Promise.all([capturePayment(w.checkout, link.order.id, token), capturePayment(w.checkout, link.order.id, token)]);
    expect([a, b].map((r) => r.ok && r.value)).toEqual(["captured", "captured"]);
    const keys = w.paypal.calls.filter((c) => c.kind === "capture").map((c) => c.key);
    expect(new Set(keys)).toEqual(new Set([`capture:${link.order.id}`]));
    expect(w.paypal.captureCount()).toBe(1);
    expect(w.orders.events.filter((e) => e.type === "order.captured")).toHaveLength(1);
    expect(w.repo.carts.get(cart.id)!.state).toBe("completed");
    expect(w.repo.variantMap.get(variantId("var_s"))!.stock).toBe(5);
    // A third call after the order is Captured does not reach PayPal at all.
    const before = w.paypal.calls.length;
    expect((await capturePayment(w.checkout, link.order.id, token)).ok).toBe(true);
    expect(w.paypal.calls.length).toBe(before);
  });

  it("TC-SEC-02: an expired, tampered or wrong-kind link is refused before PayPal", async () => {
    const { w, link, token } = await ready();
    w.paypal.approve(link.order.paypalOrderId);
    const tampered = `${token.slice(0, -3)}abc`;
    expect(await payPage(w.checkout, link.order.id, tampered)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await capturePayment(w.checkout, link.order.id, link.orderToken)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await capturePayment(w.checkout, "ord_OTHER", token)).toMatchObject({ ok: false, error: { code: "not_found" } });
    w.ids.advance(31 * 60_000);
    expect(await capturePayment(w.checkout, link.order.id, token)).toMatchObject({ ok: false, error: { code: "pay.link_expired" } });
    expect(w.paypal.calls.filter((c) => c.kind === "capture")).toHaveLength(0);
  });

  it("IR-06: start_checkout output holds no buyer email or address", async () => {
    const { w, cart } = await ready();
    void cart;
    const c2 = await cartWith(w, [{ v: "var_l", q: 1 }]);
    const r = await rpc(w.deps, "tools/call", { name: "start_checkout", arguments: { cart_id: c2.id } });
    const text = JSON.stringify(r.result);
    expect(text).not.toContain("@sandbox.test");
    expect(text).not.toContain("address");
  });
});

describe("PayPal redirect fallback (T-10)", () => {
  it("captures with PayPal's own order id, and refuses any other id", async () => {
    const w = testWorld();
    const cart = await cartWith(w, [{ v: "var_s", q: 1 }]);
    const link = await checkout(w, cart.id);
    w.paypal.approve(link.order.paypalOrderId);
    const { captureFromPayPalReturn } = await import("@/server/checkout");
    expect(await captureFromPayPalReturn(w.checkout, link.order.id, "PP999")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await captureFromPayPalReturn(w.checkout, link.order.id, link.order.paypalOrderId)).toEqual({ ok: true, value: "captured" });
  });
});
