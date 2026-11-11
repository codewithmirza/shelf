import { z } from "zod";
import type { StoreId } from "./domain/brand";
import { parseCartInput } from "./domain/cart";
import { domainError, type DomainError } from "./domain/errors";
import { toMoney } from "./domain/money";
import { err, ok, type Result } from "./domain/result";
import { readCart, upsertCart, type StoreRow, type StoredCart } from "./carts";
import { captureOrderOnce, startCheckout, type CheckoutDeps } from "./checkout";

// PayPal Cart API v1 for other agents (ADR-007). A business problem answers 200 with validation_issues;
// 400 is a malformed body, 404 an unknown cart, 422 a hard reject (SYS-CART-03).
export interface CartCaller {
  readonly storeId: StoreId;
  readonly keyId: string;
  readonly slug: string;
}

export function cartApiCart(cart: StoredCart, store: StoreRow, extra: { paypal_order_id?: string; approve_url?: string; capture_id?: string } = {}) {
  const issueFor = new Map(cart.issues.map((i) => [i.variantId, i.message]));
  return {
    id: cart.id,
    version: cart.version,
    store: { slug: store.slug, name: store.name, refund_policy: store.refundPolicy },
    lines: cart.lines.map((l) => ({ variant_id: l.variantId, title: l.title, options: { ...l.options }, quantity: l.quantity, unit_price: toMoney(l.unitPriceCents), line_total: toMoney(l.lineTotalCents), ...(issueFor.has(l.variantId) ? { issue: issueFor.get(l.variantId) } : {}) })),
    subtotal: toMoney(cart.subtotalCents),
    shipping: toMoney(cart.shippingCents),
    total: toMoney(cart.totalCents),
    validation_issues: cart.issues.map((i) => ({ code: i.code, variant_id: i.variantId, message: i.message })),
    state: cart.state,
    ...extra,
  };
}

type ApiCart = ReturnType<typeof cartApiCart>;

// One key, one store, its own carts only. Anything else reads as not found.
async function ownCart(deps: CheckoutDeps, caller: CartCaller, id: string): Promise<Result<{ cart: StoredCart; store: StoreRow }, DomainError>> {
  const r = await readCart(deps.carts, id);
  if (!r.ok) return r;
  if (r.value.cart.storeId !== caller.storeId || r.value.cart.storeKeyId !== caller.keyId) return err(domainError("not_found", "cart"));
  return r;
}

async function withOrder(deps: CheckoutDeps, cart: StoredCart, store: StoreRow): Promise<ApiCart> {
  const order = cart.state === "checking_out" || cart.state === "completed" ? await deps.orders.byCart(cart.id) : null;
  return cartApiCart(cart, store, order ? { paypal_order_id: order.paypalOrderId } : {});
}

// POST (create) and PUT (replace). The list replaces the cart; it never merges (SYS-CART-02).
export async function putCart(deps: CheckoutDeps, caller: CartCaller, cartId: string | undefined, body: unknown): Promise<Result<ApiCart, DomainError>> {
  const items = parseCartInput(body);
  if (!items.ok) return items;
  if (cartId !== undefined) {
    const own = await ownCart(deps, caller, cartId);
    if (!own.ok) return own;
    // After the PayPal order exists, the cart is fixed: a hard reject, not a silent new cart.
    if (own.value.cart.state === "checking_out" || own.value.cart.state === "completed") return err(domainError("cart.not_ready", "cart is checking out"));
  }
  const r = await upsertCart({ repo: deps.carts, ids: deps.ids }, { cartId, storeSlug: caller.slug, items: items.value, channel: "cart_api", actor: "agent", storeKeyId: caller.keyId });
  return r.ok ? ok(cartApiCart(r.value.cart, r.value.store)) : r;
}

export async function getCart(deps: CheckoutDeps, caller: CartCaller, id: string): Promise<Result<ApiCart, DomainError>> {
  const own = await ownCart(deps, caller, id);
  return own.ok ? ok(await withOrder(deps, own.value.cart, own.value.store)) : own;
}

const checkoutBody = z.object({ paypal_order_id: z.string().min(1).max(40).optional() }).strict();

// POST /checkout. Without paypal_order_id: create the PayPal order and answer approve_url, the Pay page
// the buyer opens. With it: capture once the buyer approved (422 checkout.not_approved before that).
export async function checkoutCart(deps: CheckoutDeps, caller: CartCaller, id: string, body: unknown): Promise<Result<ApiCart, DomainError>> {
  const p = checkoutBody.safeParse(body ?? {});
  if (!p.success) return err(domainError("request.invalid", "checkout body"));
  const own = await ownCart(deps, caller, id);
  if (!own.ok) return own;
  if (p.data.paypal_order_id === undefined) {
    const link = await startCheckout(deps, own.value.cart.id);
    if (!link.ok) return link;
    const fresh = await readCart(deps.carts, own.value.cart.id);
    if (!fresh.ok) return fresh;
    return ok(cartApiCart(fresh.value.cart, fresh.value.store, { paypal_order_id: link.value.order.paypalOrderId, approve_url: link.value.payUrl }));
  }
  const order = await deps.orders.byCart(own.value.cart.id);
  if (!order || order.paypalOrderId !== p.data.paypal_order_id) return err(domainError("not_found", "paypal order"));
  const captured = await captureOrderOnce(deps, order);
  if (!captured.ok) return captured;
  if (captured.value !== "captured" && captured.value !== "shipped" && captured.value !== "refunded") return err(domainError("checkout.not_approved"));
  const after = await readCart(deps.carts, own.value.cart.id);
  const row = await deps.orders.byId(order.id);
  if (!after.ok || !row) return err(domainError("server.error", "cart vanished"));
  const capture = await capturedId(deps, order.id);
  return ok(cartApiCart(after.value.cart, after.value.store, { paypal_order_id: order.paypalOrderId, ...(capture ? { capture_id: capture } : {}) }));
}

async function capturedId(deps: CheckoutDeps, orderId: string): Promise<string | null> {
  return deps.orders.captureIdOf ? deps.orders.captureIdOf(orderId) : null;
}

