import { describe, expect, it } from "vitest";
import { cents } from "@/server/domain/brand";
import { d1CartRepo } from "@/server/carts";
import { d1OrderRepo, type CheckoutDeps } from "@/server/checkout";
import { checkoutCart, getCart, putCart, type CartCaller } from "@/server/cart_api";
import { createKey, revokeKey, storeForKey } from "@/server/seller/keys";
import { sqliteD1 } from "../support/d1";
import { TOKEN_SECRET, fakeIds, fakePayPal } from "../support/fakes";

// The Cart API on the real schema, with the test fixture catalog (Maya's store, two keys).
async function world() {
  const db = sqliteD1(true);
  const ids = fakeIds();
  const paypal = fakePayPal();
  const deps: CheckoutDeps = { carts: d1CartRepo(db), orders: d1OrderRepo(db), payments: paypal, ids, tokenSecret: TOKEN_SECRET, origin: "https://s.test" };
  const k1 = await createKey(db, ids, "sto_demo_maya" as never, { label: "agent one" });
  const k2 = await createKey(db, ids, "sto_demo_maya" as never, { label: "agent two" });
  if (!k1.ok || !k2.ok) throw new Error("keys");
  const caller = async (key: string) => (await storeForKey(db, `Bearer ${key}`)) as CartCaller;
  return { db, ids, paypal, deps, k1: k1.value, k2: k2.value, a1: await caller(k1.value.key), a2: await caller(k2.value.key) };
}
const items = (...xs: [string, number][]) => ({ items: xs.map(([variant_id, quantity]) => ({ variant_id, quantity })) });

describe("Cart API v1 (TC-CART-01 to TC-CART-05)", () => {
  it("TC-CART-05: no key, a wrong key and a revoked key are refused; only the hash is stored", async () => {
    const w = await world();
    expect(await storeForKey(w.db, null)).toBeNull();
    expect(await storeForKey(w.db, "Bearer shelf_sk_notarealkeynotarealkey00")).toBeNull();
    expect(w.a1.slug).toBe("maya-mugs");
    const stored = await w.db.prepare("SELECT key_hash FROM store_keys").all<{ key_hash: string }>();
    expect(JSON.stringify(stored.results)).not.toContain(w.k1.key);
    await revokeKey(w.db, "sto_demo_maya" as never, w.k1.row.id, "2026-11-11T10:00:00Z");
    expect(await storeForKey(w.db, `Bearer ${w.k1.key}`)).toBeNull();
  });

  it("TC-CART-02 / SYS-CART-04: POST creates a CART- id; PUT replaces and never merges", async () => {
    const w = await world();
    const c = await putCart(w.deps, w.a1, undefined, items(["var_demo_mug_s", 2]));
    expect(c.ok && c.value.id).toMatch(/^CART-[A-Z0-9]+$/);
    const id = c.ok ? c.value.id : "";
    const r = await putCart(w.deps, w.a1, id, items(["var_demo_bowl", 1]));
    expect(r.ok && [r.value.version, r.value.lines.map((l) => l.variant_id), r.value.total.value]).toEqual([2, ["var_demo_bowl"], "24.00"]);
  });

  it("TC-CART-03: out of stock is 200 with an issue; unknown cart 404; bad body 400", async () => {
    const w = await world();
    const c = await putCart(w.deps, w.a1, undefined, items(["var_demo_pour", 1]));
    expect(c.ok && [c.value.state, c.value.validation_issues.map((i) => i.code)]).toEqual(["incomplete", ["OUT_OF_STOCK"]]);
    expect(await getCart(w.deps, w.a1, "CART-AAAAAAAAAAAA")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await putCart(w.deps, w.a1, undefined, { items: [{ variant_id: "x", quantity: 0 }] })).toMatchObject({ ok: false, error: { code: "request.invalid" } });
    expect(await putCart(w.deps, w.a1, undefined, items(["var_demo_mug_s", 1]).items.map((i) => ({ ...i, price: 1 })) as never)).toMatchObject({ ok: false });
  });

  it("an agent sees only the carts its own key made", async () => {
    const w = await world();
    const c = await putCart(w.deps, w.a1, undefined, items(["var_demo_mug_s", 1]));
    const id = c.ok ? c.value.id : "";
    expect(await getCart(w.deps, w.a2, id)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await putCart(w.deps, w.a2, id, items())).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("TC-CART-01 (sandbox fake): checkout gives approve_url; capture before approval is 422; after approval it completes with a capture id", async () => {
    const w = await world();
    const c = await putCart(w.deps, w.a1, undefined, items(["var_demo_mug_l", 1]));
    const id = c.ok ? c.value.id : "";
    const prep = await checkoutCart(w.deps, w.a1, id, {});
    expect(prep.ok && [prep.value.state, prep.value.total.value]).toEqual(["checking_out", "38.00"]);
    const ppid = prep.ok ? prep.value.paypal_order_id! : "";
    expect(prep.ok && prep.value.approve_url).toMatch(/^https:\/\/s\.test\/pay\/ord_/);
    expect(await putCart(w.deps, w.a1, id, items())).toMatchObject({ ok: false, error: { code: "cart.not_ready" } });
    expect(await checkoutCart(w.deps, w.a1, id, { paypal_order_id: ppid })).toMatchObject({ ok: false, error: { code: "checkout.not_approved" } });
    w.paypal.approve(ppid);
    w.ids.advance(1000);
    const done = await checkoutCart(w.deps, w.a1, id, { paypal_order_id: ppid });
    expect(done.ok && [done.value.state, done.value.capture_id]).toEqual(["completed", `CAP-${ppid}`]);
    expect((await getCart(w.deps, w.a1, id)).ok).toBe(true);
    expect(await checkoutCart(w.deps, w.a1, id, { paypal_order_id: "PP-OTHER" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    void cents;
  });

  it("TC-SEC-03: no Cart API path can approve a refund", async () => {
    const routes = (await import("node:fs")).readdirSync("src/app/api/stores/[slug]/merchant-cart", { recursive: true }) as string[];
    expect(routes.join(",")).not.toMatch(/refund/);
  });
});
