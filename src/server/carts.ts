import { z } from "zod";
import { cents, parseCartId, storeId as asStoreId, variantId as asVariantId, type CartId, type Cents, type StoreId, type VariantId } from "./domain/brand";
import { priceCart, type CartItemInput, type PricedCart, type PricedLine, type ValidationIssue, type VariantForPricing } from "./domain/cart";
import { domainError, type DomainError } from "./domain/errors";
import { newCartId, type IdSource } from "./domain/ids";
import { cartMachine, type CartState } from "./domain/machines";
import type { Actor } from "./domain/machine";
import { assertNever, err, ok, type Result } from "./domain/result";

// T-CRT-06: a cart with no change for 3 hours expires.
export const CART_TTL_MS = 3 * 60 * 60 * 1000;

export type CartChannel = "storefront" | "cart_api" | "try";

export interface StoreRow {
  readonly id: StoreId;
  readonly slug: string;
  readonly name: string;
  readonly refundPolicy: string | null;
  readonly shippingCents: Cents;
}

export interface StoredCart extends Omit<PricedCart, "state"> {
  readonly id: CartId;
  readonly storeId: StoreId;
  readonly channel: CartChannel;
  readonly state: CartState;
  readonly version: number;
  readonly expiresAt: string;
}

// The storage the cart service needs. D1 below; a fake in tests (CQ-26).
export interface CartRepo {
  storeBySlug(slug: string): Promise<StoreRow | null>;
  storeById(id: StoreId): Promise<StoreRow | null>;
  variants(ids: readonly VariantId[]): Promise<ReadonlyMap<VariantId, VariantForPricing>>;
  get(id: CartId): Promise<StoredCart | null>;
  insert(cart: StoredCart, items: readonly CartItemInput[], now: string): Promise<void>;
  // Writes only if the stored version is still `expectedVersion` (ADR-003). False means someone else wrote first.
  replace(cart: StoredCart, expectedVersion: number, items: readonly CartItemInput[], now: string): Promise<boolean>;
  // T-CRT-04: Ready to Checking out, only if the cart is still Ready at this version. The version stays,
  // so the PayPal request ID built from it stays the same on a retry.
  startCheckout(id: CartId, version: number, now: string): Promise<boolean>;
}

export type CartPlan =
  | { readonly kind: "create" }
  | { readonly kind: "replace"; readonly cart: StoredCart }
  | { readonly kind: "refuse"; readonly error: DomainError };

// Decides what a write does to an existing cart. Every cart state is handled by name (CQ-01).
export function planCartWrite(existing: StoredCart | null, store: StoreId, now: Date, actor: Actor): CartPlan {
  if (!existing) return { kind: "create" };
  if (existing.storeId !== store) return { kind: "refuse", error: domainError("cart.other_store") };
  const timedOut = Date.parse(existing.expiresAt) <= now.getTime();
  switch (existing.state) {
    case "ready":
    case "incomplete":
      // T-CRT-03. A cart past its expiry that the cron has not moved yet is treated as expired.
      if (timedOut) return { kind: "create" };
      return cartMachine.canMove(existing.state, "ready", actor) ? { kind: "replace", cart: existing } : { kind: "refuse", error: domainError("request.invalid", "actor") };
    case "checking_out":
      // A PayPal order exists for this cart; changing it now would make that order wrong.
      return timedOut ? { kind: "create" } : { kind: "refuse", error: domainError("request.invalid", "cart is checking out") };
    case "completed":
    case "expired":
      // The list replaces the cart, so a fresh cart with the same list loses nothing.
      return { kind: "create" };
    default:
      return assertNever(existing.state);
  }
}

export interface CartDeps {
  readonly repo: CartRepo;
  readonly ids: IdSource;
}

export interface UpsertInput {
  readonly cartId: string | undefined;
  readonly storeSlug: string;
  readonly items: readonly CartItemInput[];
  readonly channel: CartChannel;
  readonly actor: Extract<Actor, "buyer" | "agent">;
}

// update_cart and Cart API PUT: the list replaces the cart; amounts come from stored prices only (INV-01).
export async function upsertCart(deps: CartDeps, input: UpsertInput): Promise<Result<{ cart: StoredCart; store: StoreRow }, DomainError>> {
  const store = await deps.repo.storeBySlug(input.storeSlug);
  if (!store) return err(domainError("not_found", "store"));

  let existing: StoredCart | null = null;
  if (input.cartId !== undefined) {
    const id = parseCartId(input.cartId);
    existing = id ? await deps.repo.get(id) : null;
    if (!existing) return err(domainError("not_found", "cart"));
  }

  const now = new Date(deps.ids.now());
  const plan = planCartWrite(existing, store.id, now, input.actor);
  if (plan.kind === "refuse") return err(plan.error);

  const variants = await deps.repo.variants([...new Set(input.items.map((i) => i.variantId))]);
  const priced = priceCart(input.items, { id: store.id, shippingCents: store.shippingCents }, variants);
  const stamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + CART_TTL_MS).toISOString();

  if (plan.kind === "create") {
    const cart: StoredCart = { ...priced, id: newCartId(deps.ids), storeId: store.id, channel: input.channel, version: 1, expiresAt };
    await deps.repo.insert(cart, input.items, stamp);
    return ok({ cart, store });
  }
  const cart: StoredCart = { ...priced, id: plan.cart.id, storeId: store.id, channel: plan.cart.channel, version: plan.cart.version + 1, expiresAt };
  const written = await deps.repo.replace(cart, plan.cart.version, input.items, stamp);
  return written ? ok({ cart, store }) : err(domainError("cart.version_conflict"));
}

export async function readCart(repo: CartRepo, rawId: string): Promise<Result<{ cart: StoredCart; store: StoreRow }, DomainError>> {
  const id = parseCartId(rawId);
  const cart = id ? await repo.get(id) : null;
  if (!cart) return err(domainError("not_found", "cart"));
  const store = await repo.storeById(cart.storeId);
  if (!store) return err(domainError("server.error", "cart without store"));
  return ok({ cart, store });
}

// ---- D1 adapter -------------------------------------------------------------------------------------------

const centsSchema = z.number().int().nonnegative().transform((n) => cents(n));
const lineSchema = z.object({
  variantId: z.string().transform(asVariantId),
  title: z.string(),
  options: z.record(z.string(), z.string()),
  quantity: z.number().int().positive(),
  unitPriceCents: centsSchema,
  lineTotalCents: centsSchema,
});
const issueSchema = z.object({ code: z.enum(["OUT_OF_STOCK", "PRICE_CHANGED", "UNPUBLISHED", "OTHER_STORE", "QUANTITY_LIMIT", "NOT_FOUND"]), variantId: z.string().transform(asVariantId), message: z.string() });

interface CartRow {
  id: string; store_id: string; channel: CartChannel; lines_json: string; validation_issues_json: string;
  subtotal_cents: number; shipping_cents: number; total_cents: number; state: CartState; version: number; expires_at: string;
}

function rowToCart(r: CartRow): StoredCart {
  const lines: PricedLine[] = z.array(lineSchema).parse(JSON.parse(r.lines_json));
  const issues: ValidationIssue[] = z.array(issueSchema).parse(JSON.parse(r.validation_issues_json));
  return {
    id: r.id as CartId, storeId: asStoreId(r.store_id), channel: r.channel, lines, issues,
    subtotalCents: cents(r.subtotal_cents), shippingCents: cents(r.shipping_cents), totalCents: cents(r.total_cents),
    state: r.state, version: r.version, expiresAt: r.expires_at,
  };
}

interface StoreDbRow { id: string; slug: string; name: string; refund_policy: string | null; shipping_cents: number }
const rowToStore = (r: StoreDbRow): StoreRow => ({ id: asStoreId(r.id), slug: r.slug, name: r.name, refundPolicy: r.refund_policy, shippingCents: cents(r.shipping_cents) });
const STORE_COLS = "id, slug, name, refund_policy, shipping_cents";

export function d1CartRepo(db: D1Database): CartRepo {
  return {
    async storeBySlug(slug) {
      const r = await db.prepare(`SELECT ${STORE_COLS} FROM stores WHERE slug = ?`).bind(slug).first<StoreDbRow>();
      return r ? rowToStore(r) : null;
    },
    async storeById(id) {
      const r = await db.prepare(`SELECT ${STORE_COLS} FROM stores WHERE id = ?`).bind(id).first<StoreDbRow>();
      return r ? rowToStore(r) : null;
    },
    async variants(ids) {
      if (ids.length === 0) return new Map();
      const { results } = await db
        .prepare(`SELECT v.id, p.store_id, p.title, v.options_json, v.price_cents, v.stock, p.state FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .all<{ id: string; store_id: string; title: string; options_json: string; price_cents: number | null; stock: number; state: string }>();
      return new Map(
        results.map((r) => [
          asVariantId(r.id),
          { id: asVariantId(r.id), storeId: asStoreId(r.store_id), productTitle: r.title, options: z.record(z.string(), z.string()).parse(JSON.parse(r.options_json)), priceCents: r.price_cents === null ? null : cents(r.price_cents), stock: r.stock, published: r.state === "published" },
        ]),
      );
    },
    async get(id) {
      const r = await db.prepare("SELECT * FROM carts WHERE id = ?").bind(id).first<CartRow>();
      return r ? rowToCart(r) : null;
    },
    async insert(c, items, now) {
      await db
        .prepare(
          `INSERT INTO carts (id, store_id, channel, items_json, lines_json, subtotal_cents, shipping_cents, total_cents, validation_issues_json, state, version, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(c.id, c.storeId, c.channel, JSON.stringify(items), JSON.stringify(c.lines), c.subtotalCents, c.shippingCents, c.totalCents, JSON.stringify(c.issues), c.state, c.version, c.expiresAt, now, now)
        .run();
    },
    async replace(c, expectedVersion, items, now) {
      const res = await db
        .prepare(
          `UPDATE carts SET items_json = ?, lines_json = ?, subtotal_cents = ?, shipping_cents = ?, total_cents = ?, validation_issues_json = ?, state = ?, version = ?, expires_at = ?, updated_at = ?
           WHERE id = ? AND version = ?`,
        )
        .bind(JSON.stringify(items), JSON.stringify(c.lines), c.subtotalCents, c.shippingCents, c.totalCents, JSON.stringify(c.issues), c.state, c.version, c.expiresAt, now, c.id, expectedVersion)
        .run();
      return res.meta.changes === 1;
    },
    async startCheckout(id, version, now) {
      const res = await db.prepare("UPDATE carts SET state = 'checking_out', updated_at = ? WHERE id = ? AND version = ? AND state = 'ready'").bind(now, id, version).run();
      return res.meta.changes === 1;
    },
  };
}
