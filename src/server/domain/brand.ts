// Branded types: a Cents value or an OrderId can only come from a parser or a constructor (CQ-22).
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Cents = Brand<number, "Cents">;
export type StoreId = Brand<string, "StoreId">;
export type ProductId = Brand<string, "ProductId">;
export type VariantId = Brand<string, "VariantId">;
export type CartId = Brand<string, "CartId">;
export type OrderId = Brand<string, "OrderId">;
export type RefundRequestId = Brand<string, "RefundRequestId">;
export type PayPalOrderId = Brand<string, "PayPalOrderId">;
export type CaptureId = Brand<string, "CaptureId">;

const MAX_CENTS = 100_000_000;

// Money is whole cents, never a float, so no rounding can change a total (INV-01).
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new Error(`Not a cent amount: ${value}`);
  return value as Cents;
}

export const CART_ID_PATTERN = /^CART-[A-Z0-9]{12}$/;

export function parseCartId(value: string): CartId | null {
  return CART_ID_PATTERN.test(value) ? (value as CartId) : null;
}

// Trusted constructors for IDs read from our own database rows.
export const storeId = (v: string) => v as StoreId;
export const productId = (v: string) => v as ProductId;
export const variantId = (v: string) => v as VariantId;
export const orderId = (v: string) => v as OrderId;
export const refundRequestId = (v: string) => v as RefundRequestId;
export const paypalOrderId = (v: string) => v as PayPalOrderId;
export const captureId = (v: string) => v as CaptureId;
