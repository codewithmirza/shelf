import { z } from "zod";
import { cents, type Cents, type StoreId } from "../domain/brand";
import { domainError, type DomainError } from "../domain/errors";
import { productMachine, type ProductState } from "../domain/machines";
import { checkPrice, checkPublish } from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import { searchText } from "./photos";

export interface SellerVariant { readonly id: string; readonly options: Record<string, string>; readonly priceCents: Cents | null; readonly stock: number }
export interface SellerProduct {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly state: ProductState;
  // Fields the model filled and the seller has not edited (SYS-AI-03).
  readonly aiFields: readonly string[];
  readonly suggestedMinCents: Cents | null;
  readonly suggestedMaxCents: Cents | null;
  readonly coverPhotoId: string | null;
  readonly variants: readonly SellerVariant[];
  readonly updatedAt: string;
}

const PRODUCT_COLS = "id, title, description, category, state, ai_fields_json, suggested_min_cents, suggested_max_cents, cover_photo_id, updated_at";
interface ProductDbRow { id: string; title: string; description: string; category: string; state: ProductState; ai_fields_json: string; suggested_min_cents: number | null; suggested_max_cents: number | null; cover_photo_id: string | null; updated_at: string }

async function withVariants(db: D1Database, rows: ProductDbRow[]): Promise<SellerProduct[]> {
  if (rows.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT id, product_id, options_json, price_cents, stock FROM variants WHERE product_id IN (${rows.map(() => "?").join(",")}) ORDER BY position`)
    .bind(...rows.map((r) => r.id))
    .all<{ id: string; product_id: string; options_json: string; price_cents: number | null; stock: number }>();
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description, category: r.category, state: r.state,
    aiFields: JSON.parse(r.ai_fields_json) as string[],
    suggestedMinCents: r.suggested_min_cents === null ? null : cents(r.suggested_min_cents),
    suggestedMaxCents: r.suggested_max_cents === null ? null : cents(r.suggested_max_cents),
    coverPhotoId: r.cover_photo_id, updatedAt: r.updated_at,
    variants: results.filter((v) => v.product_id === r.id).map((v) => ({ id: v.id, options: JSON.parse(v.options_json) as Record<string, string>, priceCents: v.price_cents === null ? null : cents(v.price_cents), stock: v.stock })),
  }));
}

export async function listProducts(db: D1Database, store: StoreId): Promise<SellerProduct[]> {
  const { results } = await db.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE store_id = ? AND state != 'deleted' ORDER BY updated_at DESC`).bind(store).all<ProductDbRow>();
  return withVariants(db, results);
}

// INV-10: another store's product reads as not found.
export async function getProduct(db: D1Database, store: StoreId, id: string): Promise<SellerProduct | null> {
  const r = await db.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id = ? AND store_id = ? AND state != 'deleted'`).bind(id, store).first<ProductDbRow>();
  return r ? ((await withVariants(db, [r]))[0] ?? null) : null;
}

export const productPatch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(40).optional(),
  // Prices in US dollars as the seller typed them; null clears a price.
  variants: z.array(z.object({ id: z.string(), price: z.number().nullable().optional(), stock: z.number().int().min(0).max(9999).optional() })).max(20).optional(),
});

// PATCH: an edited field leaves ai_fields, so its "Suggested" mark goes away (SYS-AI-03).
export async function editProduct(db: D1Database, store: StoreId, id: string, body: unknown, now: string): Promise<Result<SellerProduct, DomainError>> {
  const p = productPatch.safeParse(body);
  if (!p.success) return err(domainError("request.invalid", p.error.issues.map((i) => i.path.join(".")).join(",")));
  const cur = await getProduct(db, store, id);
  if (!cur) return err(domainError("not_found", "product"));
  const patch = p.data;
  const prices = new Map<string, Cents | null>();
  for (const v of patch.variants ?? []) {
    if (!cur.variants.some((x) => x.id === v.id)) return err(domainError("not_found", "variant"));
    if (v.price === undefined) continue;
    if (v.price === null) { prices.set(v.id, null); continue; }
    const c = checkPrice(Math.round(v.price * 100));
    if (!c.ok) return c;
    prices.set(v.id, cents(c.value));
  }
  // A published product keeps a price on every variant (INV-03).
  if (cur.state === "published" && [...prices.values()].some((v) => v === null)) return err(domainError("product.price_unconfirmed"));
  const title = patch.title ?? cur.title;
  const description = patch.description ?? cur.description;
  const category = patch.category ?? cur.category;
  const edited = new Set<string>(["title", "description", "category"].filter((k) => patch[k as "title"] !== undefined));
  if (prices.size > 0) edited.add("suggested_price");
  const aiFields = cur.aiFields.filter((f) => !edited.has(f));
  await db.batch([
    db.prepare("UPDATE products SET title = ?, description = ?, category = ?, ai_fields_json = ?, search_text = ?, updated_at = ? WHERE id = ? AND store_id = ?")
      .bind(title, description, category, JSON.stringify(aiFields), searchText(title, description, category, cur.variants.map((v) => v.options)), now, id, store),
    ...(patch.variants ?? []).map((v) =>
      db.prepare("UPDATE variants SET price_cents = CASE WHEN ? THEN ? ELSE price_cents END, stock = COALESCE(?, stock) WHERE id = ? AND product_id = ?")
        .bind(prices.has(v.id) ? 1 : 0, prices.get(v.id) ?? null, v.stock ?? null, v.id, id),
    ),
  ]);
  return ok((await getProduct(db, store, id))!);
}

// T-PRD-02 (publish, INV-03), T-PRD-03 (unpublish), T-PRD-04 (delete a draft). Only the seller moves a product.
export async function moveProduct(db: D1Database, store: StoreId, id: string, to: "published" | "draft" | "deleted", now: string): Promise<Result<SellerProduct, DomainError>> {
  const cur = await getProduct(db, store, id);
  if (!cur) return err(domainError("not_found", "product"));
  if (to === "published") {
    const check = checkPublish(cur);
    if (!check.ok) return check;
  } else if (!productMachine.canMove(cur.state, to, "seller")) {
    return err(domainError("request.invalid", `product is ${cur.state}`));
  }
  const res = await db.prepare("UPDATE products SET state = ?, updated_at = ? WHERE id = ? AND store_id = ? AND state = ?").bind(to, now, id, store, cur.state).run();
  if (res.meta.changes !== 1) return err(domainError("request.invalid", "product changed"));
  return to === "deleted" ? ok({ ...cur, state: "deleted" }) : ok((await getProduct(db, store, id))!);
}
