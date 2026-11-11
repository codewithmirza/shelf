import { cents, storeId, variantId, type CartId, type StoreId, type VariantId } from "@/server/domain/brand";
import type { VariantForPricing } from "@/server/domain/cart";
import type { IdSource } from "@/server/domain/ids";
import type { Catalog, ProductCardRow, ProductDetailRow, SearchQuery } from "@/server/catalog";
import type { CartRepo, StoreRow, StoredCart } from "@/server/carts";

export const MAYA: StoreRow = { id: storeId("sto_maya"), slug: "maya-mugs", name: "Maya Mugs", refundPolicy: "Refunds within 14 days.", shippingCents: cents(600) };
export const RIVER: StoreRow = { id: storeId("sto_river"), slug: "river-prints", name: "River Prints", refundPolicy: null, shippingCents: cents(800) };

export const variant = (id: string, store: StoreRow, price: number | null, stock = 5, published = true): VariantForPricing => ({
  id: variantId(id), storeId: store.id, productTitle: `Product ${id}`, options: { Size: "Small" }, priceCents: price === null ? null : cents(price), stock, published,
});

// A clock and id source that tests move by hand (CQ-26).
export function fakeIds(start = Date.parse("2026-11-11T10:00:00Z")) {
  let t = start;
  let n = 0;
  const ids: IdSource & { advance(ms: number): void } = {
    now: () => new Date(t),
    randomBytes: (len: number) => { n++; return Uint8Array.from({ length: len }, (_, i) => (n * 31 + i * 7) % 256); },
    advance(ms) { t += ms; },
  };
  return ids;
}

export function memoryCartRepo(stores: StoreRow[], variants: VariantForPricing[]) {
  const carts = new Map<CartId, StoredCart>();
  const repo: CartRepo & { carts: typeof carts; variantMap: Map<VariantId, VariantForPricing> } = {
    carts,
    variantMap: new Map(variants.map((v) => [v.id, v])),
    async storeBySlug(slug) { return stores.find((s) => s.slug === slug) ?? null; },
    async storeById(id: StoreId) { return stores.find((s) => s.id === id) ?? null; },
    async variants(ids) { return new Map(ids.flatMap((id) => { const v = repo.variantMap.get(id); return v ? [[id, v] as const] : []; })); },
    async get(id) { return carts.get(id) ?? null; },
    async insert(c) { if (carts.has(c.id)) throw new Error("duplicate"); carts.set(c.id, c); },
    async replace(c, expected) { const cur = carts.get(c.id); if (!cur || cur.version !== expected) return false; carts.set(c.id, c); return true; },
    async startCheckout(id, version) { const cur = carts.get(id); if (!cur || cur.version !== version || cur.state !== "ready") return false; carts.set(id, { ...cur, state: "checking_out" }); return true; },
  };
  return repo;
}

export function fakeCatalog(rows: ProductCardRow[] = [], products: ProductDetailRow[] = []): { catalog: Catalog; seen: SearchQuery[] } {
  const seen: SearchQuery[] = [];
  return {
    seen,
    catalog: {
      async searchProducts(q) { seen.push(q); return rows; },
      async getProduct(id) { return products.find((p) => p.id === id) ?? null; },
    },
  };
}

// ---- Orders and PayPal ----------------------------------------------------------------------------------
import { paypalOrderId as ppId, captureId as capId, type OrderId, type PayPalOrderId } from "@/server/domain/brand";
import type { OrderRepo, OrderRow, PaymentsPort } from "@/server/checkout";
import type { CreateOrderInput } from "@/server/paypal/orders";
import { err as fail, ok as pass } from "@/server/domain/result";
import { domainError } from "@/server/domain/errors";

export const PAYEES: Record<string, string> = { sto_maya: "maya@sandbox.test", sto_river: "river@sandbox.test" };

export function memoryOrderRepo(carts: ReturnType<typeof memoryCartRepo>) {
  const orders = new Map<OrderId, OrderRow & { captureId?: string; buyerEmail?: string | null }>();
  const events: { orderId: OrderId; type: string }[] = [];
  let failNextInsert = false;
  const repo: OrderRepo & { orders: typeof orders; events: typeof events; failNextInsert(): void } = {
    orders,
    events,
    failNextInsert() { failNextInsert = true; },
    async byId(id) { return orders.get(id) ?? null; },
    async byCart(cart) { return [...orders.values()].find((o) => o.cartId === cart) ?? null; },
    async payeeEmail(store) { return PAYEES[store] ?? null; },
    async insertCreated(o) {
      if (failNextInsert) { failNextInsert = false; throw new Error("D1 down"); }
      if ([...orders.values()].some((x) => x.cartId === o.cartId)) throw new Error("UNIQUE cart_id");
      orders.set(o.id, o);
      events.push({ orderId: o.id, type: "order.created" });
    },
    async markCaptured(o, f) {
      const cur = orders.get(o.id);
      if (!cur || (cur.state !== "created" && cur.state !== "approved")) return false;
      for (const l of f.lines) { const v = carts.variantMap.get(l.variantId); if (v) carts.variantMap.set(v.id, { ...v, stock: Math.max(v.stock - l.quantity, 0) }); }
      const cart = carts.carts.get(o.cartId);
      if (cart?.state === "checking_out") carts.carts.set(cart.id, { ...cart, state: "completed" });
      events.push({ orderId: o.id, type: "order.captured" });
      orders.set(o.id, { ...cur, state: "captured", captureId: f.captureId, buyerEmail: f.buyerEmail });
      return true;
    },
  };
  return repo;
}

// Behaves like PayPal for what checkout relies on: one result per PayPal-Request-Id, and no capture before approval.
export function fakePayPal() {
  const byKey = new Map<string, PayPalOrderId>();
  const approved = new Set<string>();
  const captures = new Map<string, string>();
  const calls: { kind: "create" | "capture"; key: string; input?: CreateOrderInput }[] = [];
  let n = 0;
  const port: PaymentsPort & { calls: typeof calls; approve(id: string): void; captureCount(): number } = {
    calls,
    approve(id) { approved.add(id); },
    captureCount: () => captures.size,
    async createOrder(input) {
      calls.push({ kind: "create", key: input.requestId, input });
      let id = byKey.get(input.requestId);
      if (!id) { id = ppId(`PP${++n}`); byKey.set(input.requestId, id); }
      return pass({ paypalOrderId: id, status: "PAYER_ACTION_REQUIRED", approveUrl: `https://sandbox.paypal.test/checkoutnow?token=${id}` });
    },
    async captureOrder(id, key) {
      calls.push({ kind: "capture", key });
      if (!approved.has(id)) return fail({ ...domainError("paypal.refused", "ORDER_NOT_APPROVED"), status: 422, paypalName: "ORDER_NOT_APPROVED" });
      if (!captures.has(id)) captures.set(id, `CAP-${id}`);
      return pass({ status: "COMPLETED", capture: { id: capId(captures.get(id)!), amountCents: cents(0), status: "COMPLETED" }, payerEmail: "ben@sandbox.test", shipping: { address: { country_code: "US" } } });
    },
  };
  return port;
}

export const TOKEN_SECRET = "test-secret-test-secret-test-secret-1234";

export function testWorld(catalog: Catalog = fakeCatalog().catalog) {
  const ids = fakeIds();
  const repo = memoryCartRepo([MAYA, RIVER], [variant("var_s", MAYA, 2400, 8), variant("var_l", MAYA, 3200, 5), variant("var_sold", MAYA, 1800, 0), variant("var_river", RIVER, 4500)]);
  const orders = memoryOrderRepo(repo);
  const paypal = fakePayPal();
  const checkout = { carts: repo, orders, payments: paypal, ids, tokenSecret: TOKEN_SECRET, origin: "https://shelf.test" };
  return { ids, repo, orders, paypal, checkout, deps: { catalog, carts: { repo, ids }, checkout, origin: "https://shelf.test", version: "0.1.0" } };
}
