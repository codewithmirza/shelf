import type { Cart, Order, Product, Store, View } from "./views";

// The Storefront's one state machine (CQ-01). `screen` is what is shown; `busy` names the action in
// flight so its button can say so; `cart` and `order` remember what this frame has seen.
export type Screen =
  | { readonly kind: "waiting" }
  | { readonly kind: "results"; readonly products: Extract<View, { view: "results" }>["products"] }
  | { readonly kind: "product"; readonly product: Product; readonly store: Store }
  | { readonly kind: "cart"; readonly cart: Cart; readonly notice: string | null }
  | { readonly kind: "checkout"; readonly orderId: string; readonly token: string; readonly payUrl: string; readonly total: Cart["total"]; readonly linkShown: boolean; readonly timedOut: boolean }
  | { readonly kind: "order"; readonly order: Order; readonly justPaid: boolean }
  | { readonly kind: "failed"; readonly message: string };

export type Busy = null | "show" | "cart" | "pay" | "refund" | "status";

export interface State {
  readonly screen: Screen;
  readonly busy: Busy;
  readonly cart: Cart | null;
  readonly order: { readonly id: string; readonly token: string } | null;
  // A failure from the last action, shown above the current screen without leaving it.
  readonly notice: string | null;
}

export type Event =
  | { readonly type: "view"; readonly view: View }
  | { readonly type: "start"; readonly busy: Exclude<Busy, null> }
  | { readonly type: "failed"; readonly message: string }
  | { readonly type: "link_refused" }
  | { readonly type: "poll_timeout" }
  | { readonly type: "back_to_cart" }
  // The host shows the tool's arguments; an order token there lets this frame offer a refund.
  | { readonly type: "order_token"; readonly id: string; readonly token: string };

export const initial: State = { screen: { kind: "waiting" }, busy: null, cart: null, order: null, notice: null };

export function next(s: State, e: Event): State {
  switch (e.type) {
    case "start":
      return { ...s, busy: e.busy, notice: null };
    case "failed":
      return s.screen.kind === "waiting" ? { ...s, busy: null, screen: { kind: "failed", message: e.message } } : { ...s, busy: null, notice: e.message };
    case "link_refused":
      return s.screen.kind === "checkout" ? { ...s, screen: { ...s.screen, linkShown: true } } : s;
    case "poll_timeout":
      return s.screen.kind === "checkout" ? { ...s, screen: { ...s.screen, timedOut: true } } : s;
    case "back_to_cart":
      return s.cart ? { ...s, screen: { kind: "cart", cart: s.cart, notice: null } } : s;
    case "order_token":
      return { ...s, order: { id: e.id, token: e.token } };
    case "view":
      return onView({ ...s, busy: null, notice: null }, e.view);
  }
}

function onView(s: State, v: View): State {
  switch (v.view) {
    case "results":
      return { ...s, screen: { kind: "results", products: v.products } };
    case "product":
      return { ...s, screen: { kind: "product", product: v.product, store: v.store } };
    case "cart":
      return { ...s, cart: v.cart, screen: { kind: "cart", cart: v.cart, notice: v.error?.message ?? null } };
    case "checkout":
      return {
        ...s,
        order: { id: v.order_id, token: v.order_token },
        screen: { kind: "checkout", orderId: v.order_id, token: v.order_token, payUrl: v.pay_url, total: v.total, linkShown: false, timedOut: false },
      };
    case "order": {
      const wasWaiting = s.screen.kind === "checkout";
      const paid = v.order.state === "captured";
      // While the buyer is in PayPal, an unpaid status keeps the checkout card (it polls on).
      if (wasWaiting && (v.order.state === "created" || v.order.state === "approved")) return s;
      return { ...s, screen: { kind: "order", order: v.order, justPaid: wasWaiting && paid } };
    }
    case "error":
      return s.screen.kind === "waiting" ? { ...s, screen: { kind: "failed", message: v.error.message } } : { ...s, notice: v.error.message };
  }
}

// The cart list after one change, in the shape update_cart takes. The list replaces the cart.
export function itemsWith(cart: Cart | null, variantId: string, quantity: number): { variant_id: string; quantity: number }[] {
  const items = (cart?.lines ?? []).map((l) => ({ variant_id: l.variant_id, quantity: l.quantity }));
  const found = items.find((i) => i.variant_id === variantId);
  if (found) found.quantity = quantity;
  else items.push({ variant_id: variantId, quantity });
  return items.filter((i) => i.quantity > 0);
}
