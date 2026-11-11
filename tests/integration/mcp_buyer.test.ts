import { describe, expect, it } from "vitest";
import { cents, storeId } from "@/server/domain/brand";
import type { ProductDetailRow } from "@/server/catalog";
import { CART_TTL_MS, planCartWrite, upsertCart, type StoredCart } from "@/server/carts";
import { CART_STATES } from "@/server/domain/machines";
import { variantId } from "@/server/domain/brand";
import { rpc } from "./mcp_surface.test";
import { MAYA, fakeCatalog, testWorld } from "../support/fakes";

const mug: ProductDetailRow = {
  id: "prd_demo_mug", title: "Blue speckled mug", description: "Wheel-thrown.", imageKeys: [],
  variants: [{ id: "var_s", options: { Size: "Small" }, priceCents: cents(2400), stock: 8 }, { id: "var_l", options: { Size: "Large" }, priceCents: cents(3200), stock: 0 }],
  store: { slug: MAYA.slug, name: MAYA.name, refundPolicy: MAYA.refundPolicy },
};
const setup = () => testWorld(fakeCatalog([], [mug]).catalog);
const call = (w: ReturnType<typeof setup>, name: string, args: unknown) => rpc(w.deps, "tools/call", { name, arguments: args });

describe("Buyer tools (T-09)", () => {
  it("TC-MCP-03 (show_product): text and structuredContent hold the same facts", async () => {
    const r = await call(setup(), "show_product", { product_id: "prd_demo_mug" });
    const s = r.result.structuredContent;
    expect(s.view).toBe("product");
    expect(s.product.variants).toEqual([
      { id: "var_s", options: { Size: "Small" }, price: { currency_code: "USD", value: "24.00" }, in_stock: true },
      { id: "var_l", options: { Size: "Large" }, price: { currency_code: "USD", value: "32.00" }, in_stock: false },
    ]);
    expect(s.store.refund_policy).toBe("Refunds within 14 days.");
    const text: string = r.result.content[0].text;
    for (const fact of ["Blue speckled mug", "Maya Mugs", "Size: Small $24.00", "Size: Large $32.00 (sold out)", "Refunds within 14 days."]) expect(text).toContain(fact);
  });

  it("show_product of an unknown product answers not_found with the Gate 5 text", async () => {
    const r = await call(setup(), "show_product", { product_id: "prd_nope" });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toBe("Not found.");
    expect(r.result.structuredContent.error.code).toBe("not_found");
  });

  it("TC-MCP-03 (update_cart): totals come from stored prices and the text matches", async () => {
    const r = await call(setup(), "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 2, price: 1 }] });
    const cart = r.result.structuredContent.cart;
    expect([cart.subtotal.value, cart.shipping.value, cart.total.value, cart.state, cart.version]).toEqual(["48.00", "6.00", "54.00", "ready", 1]);
    expect(r.result.content[0].text).toBe(`Cart ${cart.id} at Maya Mugs: 2 × Product var_s $48.00. Subtotal $48.00, shipping $6.00, total $54.00.`);
  });

  it("TC-CART-02: a second update replaces the lines; old lines are gone", async () => {
    const deps = setup();
    const first = (await call(deps, "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }] })).result.structuredContent.cart;
    const second = (await call(deps, "update_cart", { cart_id: first.id, store: "maya-mugs", items: [{ variant_id: "var_l", quantity: 1 }] })).result.structuredContent.cart;
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.lines.map((l: { variant_id: string }) => l.variant_id)).toEqual(["var_l"]);
  });

  it("an empty list empties the cart and it becomes incomplete with no shipping", async () => {
    const deps = setup();
    const first = (await call(deps, "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }] })).result.structuredContent.cart;
    const empty = (await call(deps, "update_cart", { cart_id: first.id, store: "maya-mugs", items: [] })).result.structuredContent.cart;
    expect([empty.state, empty.total.value, empty.lines]).toEqual(["incomplete", "0.00", []]);
  });

  it("a sold-out item is an issue, not a line, and the cart is incomplete", async () => {
    const r = await call(setup(), "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }, { variant_id: "var_sold", quantity: 1 }] });
    const cart = r.result.structuredContent.cart;
    expect(cart.state).toBe("incomplete");
    expect(cart.validation_issues).toEqual([{ code: "OUT_OF_STOCK", variant_id: "var_sold", message: "This item sold out. It is not in your total." }]);
    expect(r.result.content[0].text).toContain("Needs attention: var_sold");
  });

  it("INV-02: a cart of one store cannot be written for another", async () => {
    const deps = setup();
    const first = (await call(deps, "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }] })).result.structuredContent.cart;
    const r = await call(deps, "update_cart", { cart_id: first.id, store: "river-prints", items: [{ variant_id: "var_river", quantity: 1 }] });
    expect(r.result.structuredContent.error.code).toBe("cart.other_store");
  });

  it("an unknown or malformed cart id answers not_found", async () => {
    for (const cart_id of ["CART-AAAAAAAAAAAA", "nonsense"]) {
      const r = await call(setup(), "update_cart", { cart_id, store: "maya-mugs", items: [] });
      expect(r.result.structuredContent.error.code).toBe("not_found");
    }
  });

  it("T-CRT-06: a cart past 3 hours is replaced by a fresh cart with the same list", async () => {
    const deps = setup();
    const first = (await call(deps, "update_cart", { store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }] })).result.structuredContent.cart;
    deps.ids.advance(CART_TTL_MS + 1);
    const next = (await call(deps, "update_cart", { cart_id: first.id, store: "maya-mugs", items: [{ variant_id: "var_s", quantity: 1 }] })).result.structuredContent.cart;
    expect(next.id).not.toBe(first.id);
    expect(next.version).toBe(1);
  });

  it("ADR-003: a write that lost the race answers cart.version_conflict", async () => {
    const deps = setup();
    const created = await upsertCart(deps.deps.carts, { cartId: undefined, storeSlug: "maya-mugs", items: [], channel: "storefront", actor: "buyer" });
    if (!created.ok) throw new Error("create failed");
    const realReplace = deps.repo.replace;
    deps.repo.replace = async (c, expected, items, now) => {
      // Another writer bumps the version between our read and our write.
      const cur = deps.repo.carts.get(c.id)!;
      deps.repo.carts.set(c.id, { ...cur, version: cur.version + 1 });
      return realReplace(c, expected, items, now);
    };
    const r = await upsertCart(deps.deps.carts, { cartId: created.value.cart.id, storeSlug: "maya-mugs", items: [], channel: "storefront", actor: "buyer" });
    expect(r.ok ? null : r.error.code).toBe("cart.version_conflict");
  });
});

describe("planCartWrite covers every cart state (CQ-34)", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  const base = (state: StoredCart["state"], expiresAt = "2026-11-11T12:00:00Z"): StoredCart => ({
    id: "CART-AAAAAAAAAAAA" as StoredCart["id"], storeId: MAYA.id, channel: "storefront", state, version: 3, expiresAt,
    lines: [], issues: [], subtotalCents: cents(0), shippingCents: cents(0), totalCents: cents(0),
  });
  const expected: Record<StoredCart["state"], string> = { ready: "replace", incomplete: "replace", checking_out: "refuse", completed: "create", expired: "create" };

  for (const state of CART_STATES) {
    it(`${state} → ${expected[state]}`, () => {
      expect(planCartWrite(base(state), MAYA.id, now, "buyer").kind).toBe(expected[state]);
    });
  }
  it("a checking-out cart past its expiry gets a fresh cart", () => {
    expect(planCartWrite(base("checking_out", "2026-11-11T09:00:00Z"), MAYA.id, now, "buyer").kind).toBe("create");
  });
  it("another store is refused before the state is read", () => {
    expect(planCartWrite(base("ready"), storeId("sto_other"), now, "buyer")).toMatchObject({ kind: "refuse", error: { code: "cart.other_store" } });
  });
  it("no cart means create", () => {
    expect(planCartWrite(null, MAYA.id, now, "agent").kind).toBe("create");
    void variantId;
  });
});
