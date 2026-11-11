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
import type { OrderStatusRepo } from "@/server/orders";
import type { CreateOrderInput } from "@/server/paypal/orders";
import { err as fail, ok as pass } from "@/server/domain/result";
import { domainError } from "@/server/domain/errors";

export const PAYEES: Record<string, string> = { sto_maya: "maya@sandbox.test", sto_river: "river@sandbox.test" };

export function memoryOrderRepo(carts: ReturnType<typeof memoryCartRepo>, clock: { now(): Date } = { now: () => new Date() }) {
  type Row = OrderRow & { captureId?: string; buyerEmail?: string | null; createdAt: string; updatedAt: string };
  const orders = new Map<OrderId, Row>();
  const events: { orderId: OrderId; type: string }[] = [];
  let failNextInsert = false;
  const stamp = () => clock.now().toISOString();
  const move = (id: OrderId, from: OrderRow["state"][], to: OrderRow["state"], type: string, extra: Partial<Row> = {}) => {
    const cur = orders.get(id);
    if (!cur || !from.includes(cur.state)) return false;
    orders.set(id, { ...cur, ...extra, state: to, updatedAt: stamp() });
    events.push({ orderId: id, type });
    return true;
  };
  const repo: OrderRepo & { orders: typeof orders; events: typeof events; failNextInsert(): void } = {
    orders,
    events,
    failNextInsert() { failNextInsert = true; },
    async byId(id) { return orders.get(id) ?? null; },
    async byCart(cart) { return [...orders.values()].find((o) => o.cartId === cart) ?? null; },
    async byPayPalId(id) { return [...orders.values()].find((o) => o.paypalOrderId === id) ?? null; },
    async payeeEmail(store) { return PAYEES[store] ?? null; },
    async insertCreated(o) {
      if (failNextInsert) { failNextInsert = false; throw new Error("D1 down"); }
      if ([...orders.values()].some((x) => x.cartId === o.cartId)) throw new Error("UNIQUE cart_id");
      orders.set(o.id, { ...o, createdAt: stamp(), updatedAt: stamp() });
      events.push({ orderId: o.id, type: "order.created" });
    },
    async markCaptured(o, f) {
      const cur = orders.get(o.id);
      if (!cur || (cur.state !== "created" && cur.state !== "approved")) return false;
      for (const l of f.lines) { const v = carts.variantMap.get(l.variantId); if (v) carts.variantMap.set(v.id, { ...v, stock: Math.max(v.stock - l.quantity, 0) }); }
      const cart = carts.carts.get(o.cartId);
      if (cart?.state === "checking_out") carts.carts.set(cart.id, { ...cart, state: "completed" });
      return move(o.id, ["created", "approved"], "captured", "order.captured", { captureId: f.captureId, buyerEmail: f.buyerEmail });
    },
    async markApproved(o) { return move(o.id, ["created"], "approved", "order.approved"); },
    async markCancelled(o) {
      const ok = move(o.id, ["created", "approved"], "cancelled", "order.cancelled");
      const cart = carts.carts.get(o.cartId);
      if (ok && cart?.state === "checking_out") carts.carts.set(cart.id, { ...cart, state: "expired" });
      return ok;
    },
    async markRefunded(o) { return move(o.id, ["captured", "shipped"], "refunded", "order.refunded"); },
    async listStale(before, limit) {
      return [...orders.values()].filter((o) => (o.state === "created" || o.state === "approved") && o.updatedAt < before).slice(0, limit);
    },
    async expireCarts(now) {
      let n = 0;
      for (const c of carts.carts.values()) {
        const live = [...orders.values()].some((o) => o.cartId === c.id && o.state !== "cancelled");
        if (c.expiresAt <= now && (c.state === "ready" || c.state === "incomplete" || (c.state === "checking_out" && !live))) {
          carts.carts.set(c.id, { ...c, state: "expired" });
          n++;
        }
      }
      return n;
    },
  };
  return repo;
}

// Behaves like PayPal for what Shelf relies on: one result per PayPal-Request-Id, no capture before
// approval, and getOrder reports the true state.
export function fakePayPal() {
  type PpState = "PAYER_ACTION_REQUIRED" | "APPROVED" | "COMPLETED" | "VOIDED";
  const byKey = new Map<string, PayPalOrderId>();
  const state = new Map<string, PpState>();
  const captures = new Map<string, string>();
  const refunded = new Set<string>();
  const calls: { kind: "create" | "capture" | "get"; key: string; input?: CreateOrderInput }[] = [];
  let n = 0;
  const snapshot = (id: string) => {
    const cap = captures.get(id);
    return {
      status: state.get(id) ?? "PAYER_ACTION_REQUIRED",
      capture: cap ? { id: capId(cap), amountCents: cents(0), status: refunded.has(id) ? "REFUNDED" : "COMPLETED" } : null,
      payerEmail: "ben@sandbox.test",
      shipping: { address: { country_code: "US" } },
    } as const;
  };
  const port: PaymentsPort & { calls: typeof calls; approve(id: string): void; captureAtPayPal(id: string): void; void(id: string): void; refund(id: string): void; captureCount(): number } = {
    calls,
    approve(id) { state.set(id, "APPROVED"); },
    captureAtPayPal(id) { state.set(id, "COMPLETED"); captures.set(id, `CAP-${id}`); },
    void(id) { state.set(id, "VOIDED"); },
    refund(id) { refunded.add(id); },
    captureCount: () => captures.size,
    async createOrder(input) {
      calls.push({ kind: "create", key: input.requestId, input });
      let id = byKey.get(input.requestId);
      if (!id) { id = ppId(`PP${++n}`); byKey.set(input.requestId, id); }
      return pass({ paypalOrderId: id, status: "PAYER_ACTION_REQUIRED", approveUrl: `https://sandbox.paypal.test/checkoutnow?token=${id}` });
    },
    async captureOrder(id, key) {
      calls.push({ kind: "capture", key });
      const st = state.get(id);
      if (st !== "APPROVED" && st !== "COMPLETED") return fail({ ...domainError("paypal.refused", "ORDER_NOT_APPROVED"), status: 422, paypalName: "ORDER_NOT_APPROVED" });
      if (!captures.has(id)) captures.set(id, `CAP-${id}`);
      state.set(id, "COMPLETED");
      return pass(snapshot(id));
    },
    async getOrder(id) {
      calls.push({ kind: "get", key: id });
      return pass(snapshot(id));
    },
  };
  return port;
}

// A small in-memory read model over the fake orders, for tests that do not need SQL.
export function memoryOrderStatusRepo(orders: ReturnType<typeof memoryOrderRepo>, carts: ReturnType<typeof memoryCartRepo>): OrderStatusRepo {
  const refunds = new Map<string, { state: "pending" | "approved" | "declined" | "done" | "failed"; declineReason: string | null }>();
  return {
    async status(id) {
      const o = orders.orders.get(id);
      if (!o) return null;
      const cart = carts.carts.get(o.cartId);
      return {
        id: o.id, state: o.state, amountCents: o.amountCents, refundedCents: cents(0), storeName: "Maya Mugs", lines: cart?.lines ?? [], tracking: null,
        refundRequest: refunds.get(id) ?? null,
        events: orders.events.filter((e) => e.orderId === id).map((e) => ({ at: o.createdAt, actor: "system", type: e.type, data: {} })),
      };
    },
    async createRefundRequest(i) {
      if (refunds.get(i.orderId)?.state === "pending") return "exists";
      refunds.set(i.orderId, { state: "pending", declineReason: null });
      orders.events.push({ orderId: i.orderId, type: "refund.requested" });
      return "created";
    },
  };
}

export const TOKEN_SECRET = "test-secret-test-secret-test-secret-1234";

export function testWorld(catalog: Catalog = fakeCatalog().catalog) {
  const ids = fakeIds();
  const repo = memoryCartRepo([MAYA, RIVER], [variant("var_s", MAYA, 2400, 8), variant("var_l", MAYA, 3200, 5), variant("var_sold", MAYA, 1800, 0), variant("var_river", RIVER, 4500)]);
  const orders = memoryOrderRepo(repo, ids);
  const paypal = fakePayPal();
  const checkout = { carts: repo, orders, payments: paypal, ids, tokenSecret: TOKEN_SECRET, origin: "https://shelf.test" };
  const orderDeps = { repo: memoryOrderStatusRepo(orders, repo), ids, tokenSecret: TOKEN_SECRET };
  return { ids, repo, orders, paypal, checkout, orderDeps, deps: { catalog, carts: { repo, ids }, checkout, orders: orderDeps, origin: "https://shelf.test", version: "0.1.0" } };
}
