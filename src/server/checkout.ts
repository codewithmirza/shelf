import { cents, orderId as asOrderId, paypalOrderId as asPayPalOrderId, type CartId, type Cents, type OrderId, type PayPalOrderId, type StoreId } from "./domain/brand";
import { priceCart, type PricedLine } from "./domain/cart";
import { domainError, type DomainError } from "./domain/errors";
import { prefixedId, type IdSource } from "./domain/ids";
import { requestKeys } from "./domain/keys";
import { orderMachine, type OrderState } from "./domain/machines";
import { assertNever, err, ok, type Result } from "./domain/result";
import { signToken, verifyToken } from "./auth/tokens";
import { readCart, type CartRepo, type StoreRow, type StoredCart } from "./carts";
import type { CreateOrderInput, CreatedOrder, OrderSnapshot } from "./paypal/orders";
import type { PayPalFailure } from "./paypal/http";

export interface OrderRow {
  readonly id: OrderId;
  readonly storeId: StoreId;
  readonly cartId: CartId;
  readonly cartVersion: number;
  readonly paypalOrderId: PayPalOrderId;
  readonly state: OrderState;
  readonly amountCents: Cents;
}

export interface CaptureFacts {
  readonly captureId: string;
  readonly buyerEmail: string | null;
  readonly shippingJson: string | null;
  readonly lines: readonly PricedLine[];
}

// Order storage the checkout needs. D1 below; a fake in tests (CQ-26).
export interface OrderRepo {
  byId(id: OrderId): Promise<OrderRow | null>;
  byCart(cart: CartId): Promise<OrderRow | null>;
  payeeEmail(store: StoreId): Promise<string | null>;
  // T-ORD-01 and its Event, in one batch.
  insertCreated(order: OrderRow, eventId: string, now: string): Promise<void>;
  // T-ORD-03, T-CRT-05, the stock decrease and one Event, in one batch that does nothing
  // unless the order is still Created or Approved. True if this call made the change.
  markCaptured(order: OrderRow, facts: CaptureFacts, eventId: string, now: string): Promise<boolean>;
}

// The two PayPal calls checkout makes. The real ones are in paypal/orders.ts.
export interface PaymentsPort {
  createOrder(input: CreateOrderInput): Promise<Result<CreatedOrder, PayPalFailure>>;
  captureOrder(id: PayPalOrderId, requestId: string): Promise<Result<OrderSnapshot, PayPalFailure>>;
}

export interface CheckoutDeps {
  readonly carts: CartRepo;
  readonly orders: OrderRepo;
  readonly payments: PaymentsPort;
  readonly ids: IdSource;
  readonly tokenSecret: string;
  readonly origin: string;
}

export interface CheckoutLink {
  readonly order: OrderRow;
  readonly orderToken: string;
  readonly payUrl: string;
  readonly expiresAt: Date;
}

async function linkFor(deps: CheckoutDeps, order: OrderRow, now: Date): Promise<CheckoutLink> {
  const pay = await signToken(deps.tokenSecret, "pay", order.id, now);
  const read = await signToken(deps.tokenSecret, "order", order.id, now);
  return { order, orderToken: read.token, payUrl: `${deps.origin}/pay/${order.id}?t=${encodeURIComponent(pay.token)}`, expiresAt: pay.expiresAt };
}

// start_checkout. Three phases around the one PayPal call (CQ-28):
// 1. reprice and move the cart Ready -> Checking out (version check), 2. create the PayPal order with a key
// from the cart version, 3. insert the Order. A crash between 2 and 3 is repaired by the next call, which
// sends the same key and so gets the same PayPal order.
export async function startCheckout(deps: CheckoutDeps, rawCartId: string): Promise<Result<CheckoutLink, DomainError>> {
  const now = new Date(deps.ids.now());
  const read = await readCart(deps.carts, rawCartId);
  if (!read.ok) return read;
  const { store } = read.value;
  let cart = read.value.cart;

  if (Date.parse(cart.expiresAt) <= now.getTime()) return err(domainError("cart.not_ready", "expired"));

  switch (cart.state) {
    case "incomplete":
      return err(domainError("cart.not_ready"));
    case "completed":
    case "expired":
      return err(domainError("cart.not_ready", cart.state));
    case "checking_out": {
      // A second tap, or a retry after a crash: same order, new link (FC-BUY-03-02).
      const existing = await deps.orders.byCart(cart.id);
      return existing ? ok(await linkFor(deps, existing, now)) : createAndRecord(deps, cart, store, now);
    }
    case "ready": {
      const repriced = await reprice(deps, cart, store, now);
      if (!repriced.ok) return repriced;
      cart = repriced.value;
      if (!(await deps.carts.startCheckout(cart.id, cart.version, now.toISOString()))) return err(domainError("cart.version_conflict"));
      return createAndRecord(deps, { ...cart, state: "checking_out" }, store, now);
    }
    default:
      return assertNever(cart.state);
  }
}

// Prices can change between the last cart update and the tap on Pay. Charge today's stored prices (INV-01).
async function reprice(deps: CheckoutDeps, cart: StoredCart, store: StoreRow, now: Date): Promise<Result<StoredCart, DomainError>> {
  const items = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const fresh = priceCart(items, { id: store.id, shippingCents: store.shippingCents }, await deps.carts.variants(items.map((i) => i.variantId)));
  const same = fresh.state === "ready" && fresh.totalCents === cart.totalCents && fresh.lines.length === cart.lines.length && fresh.lines.every((l, i) => l.unitPriceCents === cart.lines[i]?.unitPriceCents);
  if (same) return ok(cart);
  const next: StoredCart = { ...cart, ...fresh, version: cart.version + 1 };
  if (!(await deps.carts.replace(next, cart.version, items, now.toISOString()))) return err(domainError("cart.version_conflict"));
  // The buyer must see the new total before paying.
  return err(domainError(fresh.state === "ready" ? "cart.version_conflict" : "cart.not_ready", "repriced"));
}

async function createAndRecord(deps: CheckoutDeps, cart: StoredCart, store: StoreRow, now: Date): Promise<Result<CheckoutLink, DomainError>> {
  const payee = await deps.orders.payeeEmail(store.id);
  if (!payee) return err(domainError("server.error", "store without payee"));
  const id = asOrderId(prefixedId("ord", deps.ids));
  const created = await deps.payments.createOrder({
    cartId: cart.id,
    payeeEmail: payee,
    storeName: store.name,
    lines: cart.lines.map((l) => ({ name: l.title, sku: l.variantId, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    subtotalCents: cart.subtotalCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
    returnUrl: `${deps.origin}/pay/${id}/done`,
    cancelUrl: `${deps.origin}/pay/${id}/cancelled`,
    requestId: requestKeys.createOrder(cart.id, cart.version),
  });
  if (!created.ok) return err({ code: created.error.code, ...(created.error.detail ? { detail: created.error.detail } : {}) });

  const order: OrderRow = { id, storeId: store.id, cartId: cart.id, cartVersion: cart.version, paypalOrderId: created.value.paypalOrderId, state: "created", amountCents: cart.totalCents };
  try {
    await deps.orders.insertCreated(order, prefixedId("evt", deps.ids), now.toISOString());
  } catch {
    // Another call recorded the same PayPal order first (cart_id is unique). Use that row.
    const winner = await deps.orders.byCart(cart.id);
    if (!winner) return err(domainError("server.error", "order insert"));
    return ok(await linkFor(deps, winner, now));
  }
  return ok(await linkFor(deps, order, now));
}

export interface PayPageData {
  readonly order: OrderRow;
  readonly cart: StoredCart;
  readonly store: StoreRow;
}

async function orderFromPayToken(deps: CheckoutDeps, rawOrderId: string, token: string): Promise<Result<OrderRow, DomainError>> {
  const check = await verifyToken(deps.tokenSecret, token, "pay", rawOrderId, new Date(deps.ids.now()));
  if (!check.ok) return err(domainError(check.reason === "expired" ? "pay.link_expired" : "not_found", check.reason));
  const order = await deps.orders.byId(asOrderId(rawOrderId));
  return order ? ok(order) : err(domainError("not_found", "order"));
}

// GET /api/pay/{order}: what the Pay page shows. Only the signed link opens it (THR-08).
export async function payPage(deps: CheckoutDeps, rawOrderId: string, token: string): Promise<Result<PayPageData, DomainError>> {
  const order = await orderFromPayToken(deps, rawOrderId, token);
  if (!order.ok) return order;
  const cart = await readCart(deps.carts, order.value.cartId);
  if (!cart.ok) return err(domainError("server.error", "order without cart"));
  return ok({ order: order.value, cart: cart.value.cart, store: cart.value.store });
}

// POST /api/pay/{order}/capture. Calling it twice captures once: a final order answers at once, and the
// PayPal call carries capture:{order} as its request ID (INV-04, AC-BUY-03-03).
export async function capturePayment(deps: CheckoutDeps, rawOrderId: string, token: string): Promise<Result<OrderState, DomainError>> {
  const found = await orderFromPayToken(deps, rawOrderId, token);
  if (!found.ok) return found;
  const order = found.value;
  switch (order.state) {
    case "captured":
    case "shipped":
    case "refunded":
      return ok(order.state);
    case "cancelled":
      return err(domainError("pay.link_expired", "cancelled"));
    case "created":
    case "approved":
      break;
    default:
      return assertNever(order.state);
  }

  const snap = await deps.payments.captureOrder(order.paypalOrderId, requestKeys.capture(order.id));
  if (!snap.ok) {
    if (snap.error.paypalName === "ORDER_NOT_APPROVED") return err(domainError("checkout.not_approved"));
    return err({ code: snap.error.code, ...(snap.error.detail ? { detail: snap.error.detail } : {}) });
  }
  const capture = snap.value.capture;
  if (snap.value.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
    // Pending at PayPal: the webhook or the scheduled read finishes it (SYS-PAY-09).
    return ok(order.state);
  }
  if (!orderMachine.canMove(order.state, "captured", "system")) return err(domainError("server.error", "machine"));
  const cart = await readCart(deps.carts, order.cartId);
  if (!cart.ok) return err(domainError("server.error", "order without cart"));
  await deps.orders.markCaptured(
    order,
    { captureId: capture.id, buyerEmail: snap.value.payerEmail, shippingJson: snap.value.shipping === null ? null : JSON.stringify(snap.value.shipping), lines: cart.value.cart.lines },
    prefixedId("evt", deps.ids),
    new Date(deps.ids.now()).toISOString(),
  );
  return ok("captured");
}

// ---- D1 adapter -------------------------------------------------------------------------------------------

interface OrderDbRow { id: string; store_id: string; cart_id: string; cart_version: number; paypal_order_id: string; state: OrderState; amount_cents: number }
const ORDER_COLS = "id, store_id, cart_id, cart_version, paypal_order_id, state, amount_cents";
const rowToOrder = (r: OrderDbRow): OrderRow => ({
  id: asOrderId(r.id), storeId: r.store_id as StoreId, cartId: r.cart_id as CartId, cartVersion: r.cart_version,
  paypalOrderId: asPayPalOrderId(r.paypal_order_id), state: r.state, amountCents: cents(r.amount_cents),
});

export function d1OrderRepo(db: D1Database): OrderRepo {
  return {
    async byId(id) {
      const r = await db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`).bind(id).first<OrderDbRow>();
      return r ? rowToOrder(r) : null;
    },
    async byCart(cart) {
      const r = await db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE cart_id = ?`).bind(cart).first<OrderDbRow>();
      return r ? rowToOrder(r) : null;
    },
    async payeeEmail(store) {
      const r = await db.prepare("SELECT se.paypal_email FROM stores st JOIN sellers se ON se.id = st.seller_id WHERE st.id = ?").bind(store).first<{ paypal_email: string }>();
      return r?.paypal_email ?? null;
    },
    async insertCreated(o, eventId, now) {
      await db.batch([
        db.prepare(`INSERT INTO orders (${ORDER_COLS}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`)
          .bind(o.id, o.storeId, o.cartId, o.cartVersion, o.paypalOrderId, o.amountCents, now, now),
        db.prepare("INSERT INTO events (id, order_id, actor, type, data_json, created_at) VALUES (?, ?, 'system', 'order.created', ?, ?)")
          .bind(eventId, o.id, JSON.stringify({ paypal_order_id: o.paypalOrderId, amount_cents: o.amountCents }), now),
      ]);
    },
    async markCaptured(o, f, eventId, now) {
      // Every statement runs only while the order is still Created or Approved; the order update is last,
      // so a second batch finds it Captured and changes nothing (D1 runs a batch as one transaction).
      const open = "EXISTS (SELECT 1 FROM orders WHERE id = ? AND state IN ('created','approved'))";
      const results = await db.batch([
        ...f.lines.map((l) => db.prepare(`UPDATE variants SET stock = MAX(stock - ?, 0) WHERE id = ? AND ${open}`).bind(l.quantity, l.variantId, o.id)),
        db.prepare(`UPDATE carts SET state = 'completed', updated_at = ? WHERE id = ? AND state = 'checking_out' AND ${open}`).bind(now, o.cartId, o.id),
        db.prepare(`INSERT INTO events (id, order_id, actor, type, data_json, created_at) SELECT ?, ?, 'system', 'order.captured', ?, ? WHERE ${open}`)
          .bind(eventId, o.id, JSON.stringify({ capture_id: f.captureId }), now, o.id),
        db.prepare("UPDATE orders SET state = 'captured', capture_id = ?, buyer_email = ?, shipping_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND state IN ('created','approved')")
          .bind(f.captureId, f.buyerEmail, f.shippingJson, now, o.id),
      ]);
      return (results.at(-1)?.meta.changes ?? 0) === 1;
    },
  };
}
