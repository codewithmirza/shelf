import { z } from "zod";
import { cents, storeId as asStoreId, type StoreId } from "../domain/brand";
import { domainError, type DomainError } from "../domain/errors";
import { prefixedId, type IdSource } from "../domain/ids";
import { err, ok, type Result } from "../domain/result";
import type { Seller } from "../auth/session";

// AC-SEL-01-03: lower case letters, digits and hyphens, 3 to 40, no hyphen at either end.
export function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

export const storeInput = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().regex(SLUG),
  refund_policy: z.string().trim().max(200).optional(),
  // Shipping in US dollars for the whole order, 0 to 100.
  shipping: z.number().min(0).max(100),
});

export interface StoreRecord {
  readonly id: StoreId;
  readonly slug: string;
  readonly name: string;
  readonly refundPolicy: string | null;
  readonly shippingCents: number;
}

export interface SellerStoreRepo {
  insert(s: StoreRecord, sellerId: string, now: string): Promise<"created" | "slug_taken" | "has_store">;
  bySeller(sellerId: string): Promise<StoreRecord | null>;
  slugTaken(slug: string): Promise<boolean>;
  update(id: StoreId, fields: { name: string; refundPolicy: string | null; shippingCents: number }): Promise<void>;
}

// FC-SEL-01-02: suggest the first free name-2, name-3, …
export async function suggestSlug(repo: SellerStoreRepo, slug: string): Promise<string> {
  for (let n = 2; n < 50; n++) {
    const candidate = `${slug.slice(0, 37)}-${n}`;
    if (!(await repo.slugTaken(candidate))) return candidate;
  }
  return `${slug.slice(0, 30)}-${Date.now().toString(36)}`;
}

export async function createStore(repo: SellerStoreRepo, ids: IdSource, seller: Seller, body: unknown): Promise<Result<StoreRecord, DomainError & { suggestion?: string }>> {
  const p = storeInput.safeParse(body);
  if (!p.success) return err(domainError("request.invalid", p.error.issues.map((i) => i.path.join(".")).join(",")));
  const store: StoreRecord = {
    id: asStoreId(prefixedId("sto", ids)),
    slug: p.data.slug,
    name: p.data.name,
    refundPolicy: p.data.refund_policy || null,
    shippingCents: cents(Math.round(p.data.shipping * 100)),
  };
  const r = await repo.insert(store, seller.id, new Date(ids.now()).toISOString());
  if (r === "slug_taken") return err({ ...domainError("store.slug_taken"), suggestion: await suggestSlug(repo, store.slug) });
  if (r === "has_store") return err(domainError("request.invalid", "one store per seller in R1"));
  return ok(store);
}

const rowTo = (r: { id: string; slug: string; name: string; refund_policy: string | null; shipping_cents: number }): StoreRecord => ({ id: asStoreId(r.id), slug: r.slug, name: r.name, refundPolicy: r.refund_policy, shippingCents: r.shipping_cents });

export function d1SellerStoreRepo(db: D1Database): SellerStoreRepo {
  return {
    async insert(s, sellerId, now) {
      try {
        await db.prepare("INSERT INTO stores (id, seller_id, slug, name, refund_policy, shipping_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(s.id, sellerId, s.slug, s.name, s.refundPolicy, s.shippingCents, now).run();
        return "created";
      } catch (e) {
        const msg = String(e);
        if (msg.includes("stores.slug")) return "slug_taken";
        if (msg.includes("stores.seller_id")) return "has_store";
        throw e;
      }
    },
    async bySeller(sellerId) {
      const r = await db.prepare("SELECT id, slug, name, refund_policy, shipping_cents FROM stores WHERE seller_id = ?").bind(sellerId).first<Parameters<typeof rowTo>[0]>();
      return r ? rowTo(r) : null;
    },
    async slugTaken(slug) {
      return (await db.prepare("SELECT 1 AS x FROM stores WHERE slug = ?").bind(slug).first()) !== null;
    },
    async update(id, f) {
      await db.prepare("UPDATE stores SET name = ?, refund_policy = ?, shipping_cents = ? WHERE id = ?").bind(f.name, f.refundPolicy, f.shippingCents, id).run();
    },
  };
}
