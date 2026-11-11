import { describe, expect, it } from "vitest";
import { initial, itemsWith, next, type State } from "../../storefront/src/machine";
import { parseView, usd, type Cart, type View } from "../../storefront/src/views";

const m = (value: string) => ({ currency_code: "USD" as const, value });
const store = { slug: "maya-mugs", name: "Maya Mugs", refund_policy: null };
const cart: Cart = { id: "CART-AAAAAAAAAAAA", version: 1, store, lines: [{ variant_id: "v1", title: "Mug", options: {}, quantity: 2, unit_price: m("24.00"), line_total: m("48.00") }], subtotal: m("48.00"), shipping: m("6.00"), total: m("54.00"), validation_issues: [], state: "ready" };
const order = (state: "created" | "captured") => ({ view: "order", order: { id: "ord_1", state, store: "Maya Mugs", total: m("54.00"), lines: [], tracking: null, refund_request: null, timeline: [] } }) as View;
const go = (s: State, ...views: View[]) => views.reduce((acc, view) => next(acc, { type: "view", view }), s);

describe("Storefront state machine (CQ-01)", () => {
  it("a cart result is remembered for later changes", () => {
    const s = go(initial, { view: "cart", cart });
    expect(s.cart?.id).toBe(cart.id);
    expect(s.screen.kind).toBe("cart");
  });

  it("checkout keeps waiting while PayPal is unpaid, then shows the Paid moment", () => {
    const s = go(initial, { view: "checkout", order_id: "ord_1", order_token: "tok", pay_url: "https://x/pay", total: m("54.00"), expires_at: "" });
    expect(go(s, order("created")).screen.kind).toBe("checkout");
    const paid = go(s, order("captured")).screen;
    expect(paid.kind === "order" && paid.justPaid).toBe(true);
  });

  it("an order opened later is not a Paid moment", () => {
    const s = go(initial, order("captured")).screen;
    expect(s.kind === "order" && s.justPaid).toBe(false);
  });

  it("an error keeps the screen and shows a notice; before any screen it becomes the screen", () => {
    const err: View = { view: "error", error: { code: "x", message: "Nope." } };
    expect(go(go(initial, { view: "cart", cart }), err)).toMatchObject({ screen: { kind: "cart" }, notice: "Nope." });
    expect(go(initial, err).screen).toEqual({ kind: "failed", message: "Nope." });
  });

  it("start clears the notice and names the busy action; a result clears busy", () => {
    const s = next({ ...initial, notice: "old" }, { type: "start", busy: "pay" });
    expect([s.busy, s.notice]).toEqual(["pay", null]);
    expect(go(s, { view: "cart", cart }).busy).toBeNull();
  });

  it("itemsWith replaces, adds and removes in the update_cart shape", () => {
    expect(itemsWith(cart, "v1", 3)).toEqual([{ variant_id: "v1", quantity: 3 }]);
    expect(itemsWith(cart, "v2", 1)).toEqual([{ variant_id: "v1", quantity: 2 }, { variant_id: "v2", quantity: 1 }]);
    expect(itemsWith(cart, "v1", 0)).toEqual([]);
    expect(itemsWith(null, "v9", 1)).toEqual([{ variant_id: "v9", quantity: 1 }]);
  });

  it("parseView refuses unknown shapes; usd formats server strings", () => {
    expect(parseView({ view: "results", products: [{ id: 1 }] })).toBeNull();
    expect(parseView({ view: "nope" })).toBeNull();
    expect(usd(m("1234.50"))).toBe("$1,234.50");
  });
});
