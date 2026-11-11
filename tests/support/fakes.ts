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
