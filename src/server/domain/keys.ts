import type { CartId, OrderId, RefundRequestId } from "./brand";

// Idempotency keys for PayPal-Request-Id, built from Shelf's own records so a retry sends the same key (CQ-27, SYS-PAY-03).
export const requestKeys = {
  createOrder: (cart: CartId, version: number) => `order:${cart}:v${version}`,
  capture: (order: OrderId) => `capture:${order}`,
  refund: (refund: RefundRequestId) => `refund:${refund}`,
  track: (order: OrderId, trackingNumber: string) => `track:${order}:${trackingNumber.replace(/\s+/g, "")}`,
} as const;
