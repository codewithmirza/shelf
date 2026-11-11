import type { Cents } from "./domain/brand";

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

export interface Catalog {
  searchProducts(q: SearchQuery): Promise<readonly ProductCardRow[]>;
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
        priceFromCents: r.price_from as Cents,
        coverKey: r.cover_key,
        store: { slug: r.slug, name: r.name, refundPolicy: r.refund_policy },
      }));
    },
  };
}
