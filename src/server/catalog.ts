import { z } from "zod";
import { cents, type Cents } from "./domain/brand";

// The read side of the catalog that buyer tools use. D1 in production, a fake in tests (CQ-26).
export interface ProductCardRow {
  readonly id: string;
  readonly title: string;
  readonly priceFromCents: Cents;
  readonly coverKey: string | null;
  readonly store: { readonly slug: string; readonly name: string; readonly refundPolicy: string | null };
}

export interface SearchQuery {
  readonly words: readonly string[];
  readonly maxPriceCents: Cents | null;
  readonly storeSlug: string | null;
  readonly limit: number;
}

export interface ProductDetailRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly imageKeys: readonly string[];
  readonly variants: readonly { readonly id: string; readonly options: Readonly<Record<string, string>>; readonly priceCents: Cents; readonly stock: number }[];
  readonly store: ProductCardRow["store"];
}

export interface Catalog {
  searchProducts(q: SearchQuery): Promise<readonly ProductCardRow[]>;
  // Null unless the product is published and has at least one priced variant.
  getProduct(id: string): Promise<ProductDetailRow | null>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Only published products with at least one confirmed price appear (AC-SEL-03-02, INV-03).
export function d1Catalog(db: D1Database): Catalog {
  return {
    async searchProducts(q) {
      const where: string[] = ["p.state = 'published'", "v.price_cents IS NOT NULL"];
      const binds: unknown[] = [];
      for (const w of q.words) { where.push("p.search_text LIKE ? ESCAPE '\\'"); binds.push(`%${escapeLike(w)}%`); }
      if (q.storeSlug) { where.push("s.slug = ?"); binds.push(q.storeSlug); }
      const having = q.maxPriceCents === null ? "" : "HAVING MIN(v.price_cents) <= ?";
      if (q.maxPriceCents !== null) binds.push(q.maxPriceCents);
      binds.push(q.limit);
      const sql =
        `SELECT p.id, p.title, MIN(v.price_cents) AS price_from, ph.r2_key AS cover_key, s.slug, s.name, s.refund_policy
         FROM products p JOIN stores s ON s.id = p.store_id JOIN variants v ON v.product_id = p.id
         LEFT JOIN photos ph ON ph.id = p.cover_photo_id
         WHERE ${where.join(" AND ")} GROUP BY p.id ${having} ORDER BY p.updated_at DESC LIMIT ?`;
      const { results } = await db.prepare(sql).bind(...binds).all<{ id: string; title: string; price_from: number; cover_key: string | null; slug: string; name: string; refund_policy: string | null }>();
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        priceFromCents: cents(r.price_from),
        coverKey: r.cover_key,
        store: { slug: r.slug, name: r.name, refundPolicy: r.refund_policy },
      }));
    },
    async getProduct(id) {
      const p = await db
        .prepare(
          `SELECT p.id, p.title, p.description, s.slug, s.name, s.refund_policy FROM products p JOIN stores s ON s.id = p.store_id
           WHERE p.id = ? AND p.state = 'published'`,
        )
        .bind(id)
        .first<{ id: string; title: string; description: string; slug: string; name: string; refund_policy: string | null }>();
      if (!p) return null;
      const [variants, photos] = await db.batch<{ id: string; options_json: string; price_cents: number; stock: number } & { r2_key: string }>([
        db.prepare("SELECT id, options_json, price_cents, stock FROM variants WHERE product_id = ? AND price_cents IS NOT NULL ORDER BY position").bind(id),
        db.prepare("SELECT r2_key FROM photos WHERE product_id = ? ORDER BY created_at").bind(id),
      ]);
      const vs = variants?.results ?? [];
      if (vs.length === 0) return null;
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        imageKeys: (photos?.results ?? []).map((r) => r.r2_key),
        variants: vs.map((v) => ({ id: v.id, options: optionsSchema.parse(JSON.parse(v.options_json)), priceCents: cents(v.price_cents), stock: v.stock })),
        store: { slug: p.slug, name: p.name, refundPolicy: p.refund_policy },
      };
    },
  };
}

const optionsSchema = z.record(z.string(), z.string());
