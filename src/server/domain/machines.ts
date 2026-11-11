import { defineMachine } from "./machine";

// Gate 2 state machines. A move that is not in a table cannot happen (CQ-02).

export const PRODUCT_STATES = ["draft", "published", "deleted"] as const;
export type ProductState = (typeof PRODUCT_STATES)[number];
export const productMachine = defineMachine("SM-PRD", PRODUCT_STATES, [
  { id: "T-PRD-02", from: ["draft"], to: "published", by: ["seller"] },
  { id: "T-PRD-03", from: ["published"], to: "draft", by: ["seller"] },
  { id: "T-PRD-04", from: ["draft"], to: "deleted", by: ["seller"] },
]);

export const CART_STATES = ["ready", "incomplete", "checking_out", "completed", "expired"] as const;
export type CartState = (typeof CART_STATES)[number];
export const cartMachine = defineMachine("SM-CRT", CART_STATES, [
  // T-CRT-03: replacing items recomputes the cart; the result can be either state.
  { id: "T-CRT-03", from: ["ready", "incomplete"], to: "ready", by: ["buyer", "agent"] },
  { id: "T-CRT-03", from: ["ready", "incomplete"], to: "incomplete", by: ["buyer", "agent"] },
  { id: "T-CRT-04", from: ["ready"], to: "checking_out", by: ["buyer", "agent"] },
  { id: "T-CRT-05", from: ["checking_out"], to: "completed", by: ["system", "paypal"] },
  { id: "T-CRT-06", from: ["ready", "incomplete", "checking_out"], to: "expired", by: ["system"] },
]);

export const ORDER_STATES = ["created", "approved", "captured", "shipped", "refunded", "cancelled"] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export const orderMachine = defineMachine("SM-ORD", ORDER_STATES, [
  { id: "T-ORD-02", from: ["created"], to: "approved", by: ["buyer", "paypal"] },
  // A capture can land before the approval webhook, so created may go straight to captured.
  { id: "T-ORD-03", from: ["created", "approved"], to: "captured", by: ["system", "paypal"] },
  { id: "T-ORD-04", from: ["captured"], to: "shipped", by: ["seller"] },
  { id: "T-ORD-05", from: ["captured", "shipped"], to: "refunded", by: ["system", "paypal"] },
  { id: "T-ORD-06", from: ["created", "approved"], to: "cancelled", by: ["system", "paypal"] },
]);

export const REFUND_STATES = ["pending", "approved", "declined", "done", "failed"] as const;
export type RefundState = (typeof REFUND_STATES)[number];
export const refundMachine = defineMachine("SM-RFD", REFUND_STATES, [
  // INV-05: only the seller moves a request to approved or declined.
  { id: "T-RFD-02", from: ["pending"], to: "approved", by: ["seller"] },
  { id: "T-RFD-03", from: ["pending"], to: "declined", by: ["seller"] },
  { id: "T-RFD-04", from: ["approved"], to: "done", by: ["system", "paypal"] },
  { id: "T-RFD-05", from: ["approved"], to: "failed", by: ["system", "paypal"] },
]);
