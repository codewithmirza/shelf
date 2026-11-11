import { describe, expect, it } from "vitest";
import { variantId, type CartId } from "@/server/domain/brand";
import { d1Catalog } from "@/server/catalog";
import { d1CartRepo, upsertCart } from "@/server/carts";
import { capturePayment, d1OrderRepo, startCheckout, type CheckoutDeps } from "@/server/checkout";
import { reconcile, CANCEL_AFTER_MS } from "@/server/reconcile";
import { d1WebhookRepo } from "@/server/webhooks";
import { sqliteD1 } from "../support/d1";
import { TOKEN_SECRET, fakeIds, fakePayPal } from "../support/fakes";

// The D1 adapters with their real SQL, on the real migration and seed (TC-MCP-02 and the guarded batches).
function d1World() {
  const db = sqliteD1(true);
  const ids = fakeIds();
  const paypal = fakePayPal();
  const deps: CheckoutDeps = { carts: d1CartRepo(db), orders: d1OrderRepo(db), payments: paypal, ids, tokenSecret: TOKEN_SECRET, origin: "https://shelf.test" };
  const q = async <T>(sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all<T>()).results;
  return { db, ids, paypal, deps, q };
}

async function paidFlow(w: ReturnType<typeof d1World>, qty = 2) {
  const cart = await upsertCart({ repo: w.deps.carts, ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId("var_demo_mug_s"), quantity: qty }], channel: "storefront", actor: "buyer" });
  if (!cart.ok) throw new Error(cart.error.code);
  const link = await startCheckout(w.deps, cart.value.cart.id);
  if (!link.ok) throw new Error(link.error.code);
  return { cartId: cart.value.cart.id, link: link.value, token: decodeURIComponent(new URL(link.value.payUrl).searchParams.get("t")!) };
}

describe("D1 adapters on the real schema", () => {
  it("TC-MCP-02: search returns only published products under the maximum price", async () => {
    const { db } = d1World();
    const cat = d1Catalog(db);
    const all = await cat.searchProducts({ words: [], maxPriceCents: null, storeSlug: null, limit: 6 });
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(6);
    const cheap = await cat.searchProducts({ words: [], maxPriceCents: 2500 as never, storeSlug: null, limit: 6 });
    expect(cheap.every((r) => r.priceFromCents <= 2500)).toBe(true);
    const mug = await cat.searchProducts({ words: ["mug"], maxPriceCents: null, storeSlug: "maya-mugs", limit: 6 });
    expect(mug.map((r) => r.id)).toContain("prd_demo_mug");
    expect(await cat.searchProducts({ words: ["100%_off"], maxPriceCents: null, storeSlug: null, limit: 6 })).toEqual([]);
  });

  it("getProduct returns priced variants and refuses unknown ids", async () => {
    const { db } = d1World();
    const cat = d1Catalog(db);
    const p = await cat.getProduct("prd_demo_mug");
    expect(p?.variants.map((v) => v.id)).toEqual(["var_demo_mug_s", "var_demo_mug_l"]);
    expect(await cat.getProduct("prd_nope")).toBeNull();
  });

  it("carts: create, replace with a version check, and a lost race", async () => {
    const w = d1World();
    const repo = w.deps.carts;
    const c = await upsertCart({ repo, ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId("var_demo_mug_s"), quantity: 1 }], channel: "storefront", actor: "buyer" });
    if (!c.ok) throw new Error("create");
    const stored = await repo.get(c.value.cart.id);
    expect(stored).toMatchObject({ state: "ready", version: 1, totalCents: 3000 });
    expect(await repo.replace({ ...stored!, version: 2 }, 1, [], "2026-11-11T10:00:00Z")).toBe(true);
    expect(await repo.replace({ ...stored!, version: 2 }, 1, [], "2026-11-11T10:00:00Z")).toBe(false);
  });

  it("checkout and capture: one order, stock down once, cart completed, two events", async () => {
    const w = d1World();
    const { link, token, cartId } = await paidFlow(w, 2);
    expect(await w.q("SELECT state FROM carts WHERE id = ?", cartId)).toEqual([{ state: "checking_out" }]);
    w.paypal.approve(link.order.paypalOrderId);
    w.ids.advance(5_000);
    expect(await capturePayment(w.deps, link.order.id, token)).toEqual({ ok: true, value: "captured" });
    // A second batch after capture changes nothing.
    const order = (await w.deps.orders.byId(link.order.id))!;
    expect(await w.deps.orders.markCaptured({ ...order, state: "approved" }, { captureId: "X", buyerEmail: null, shippingJson: null, lines: [{ variantId: variantId("var_demo_mug_s"), quantity: 2 } as never] }, "evt_dup", "2026-11-11T10:00:00Z")).toBe(false);
    expect(await w.q("SELECT stock FROM variants WHERE id = 'var_demo_mug_s'")).toEqual([{ stock: 6 }]);
    expect(await w.q("SELECT state, capture_id, buyer_email FROM orders WHERE id = ?", link.order.id)).toEqual([{ state: "captured", capture_id: `CAP-${link.order.paypalOrderId}`, buyer_email: "ben@sandbox.test" }]);
    expect(await w.q("SELECT state FROM carts WHERE id = ?", cartId)).toEqual([{ state: "completed" }]);
    expect(await w.q("SELECT type FROM events WHERE order_id = ? ORDER BY id", link.order.id)).toEqual([{ type: "order.created" }, { type: "order.captured" }]);
  });

  it("refund, approve and cancel batches move only from their allowed states", async () => {
    const w = d1World();
    const a = await paidFlow(w);
    const orders = w.deps.orders;
    const row = (await orders.byId(a.link.order.id))!;
    expect(await orders.markRefunded(row, "evt_r1", "2026-11-11T10:00:00Z")).toBe(false);
    expect(await orders.markApproved(row, "evt_a1", "2026-11-11T10:00:00Z")).toBe(true);
    expect(await orders.markApproved(row, "evt_a2", "2026-11-11T10:00:00Z")).toBe(false);
    expect(await orders.markCancelled({ ...row, state: "approved" }, "test", "evt_c1", "2026-11-11T10:00:00Z")).toBe(true);
    expect(await w.q("SELECT state FROM carts WHERE id = ?", a.cartId)).toEqual([{ state: "expired" }]);
    const types = (await w.q<{ type: string }>("SELECT type FROM events WHERE order_id = ?", a.link.order.id)).map((e) => e.type).sort();
    expect(types).toEqual(["order.approved", "order.cancelled", "order.created"]);
  });

  it("the reconciler on D1: cancels after 3 hours and expires idle carts", async () => {
    const w = d1World();
    const a = await paidFlow(w);
    await upsertCart({ repo: w.deps.carts, ids: w.ids }, { cartId: undefined, storeSlug: "river-prints", items: [], channel: "storefront", actor: "buyer" });
    w.ids.advance(CANCEL_AFTER_MS + 60_000);
    const report = await reconcile(w.deps);
    expect(report).toMatchObject({ read: 1, cancelled: 1, cartsExpired: 1 });
    expect(await w.q("SELECT state FROM orders WHERE id = ?", a.link.order.id)).toEqual([{ state: "cancelled" }]);
    expect(await w.q("SELECT COUNT(*) AS n FROM carts WHERE state = 'expired'")).toEqual([{ n: 2 }]);
  });

  it("webhook events are recorded once (INV-08)", async () => {
    const { db } = d1World();
    const repo = d1WebhookRepo(db);
    const e = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} };
    expect(await repo.seen("WH-1")).toBe(false);
    await repo.record(e, "PP1", "2026-11-11T10:00:00Z");
    await repo.record(e, "PP1", "2026-11-11T10:00:00Z");
    expect(await repo.seen("WH-1")).toBe(true);
  });

  it("the seed has confirmed prices only on published products (INV-03)", async () => {
    const { q } = d1World();
    expect(await q("SELECT COUNT(*) AS n FROM variants v JOIN products p ON p.id = v.product_id WHERE p.state = 'published' AND v.price_cents IS NULL")).toEqual([{ n: 0 }]);
    void (null as unknown as CartId);
  });
});
