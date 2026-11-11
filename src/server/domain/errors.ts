// The error codes of Gate 5 (api/error-codes.yaml). A domain error carries one of these codes, never free text (CQ-32).
export const ERROR_CODES = [
  "request.invalid",
  "auth.required",
  "auth.store_key_invalid",
  "not_found",
  "cart.other_store",
  "cart.version_conflict",
  "cart.not_ready",
  "checkout.not_approved",
  "product.price_unconfirmed",
  "store.slug_taken",
  "photo.invalid",
  "pay.link_expired",
  "refund.not_allowed",
  "paypal.unavailable",
  "paypal.refused",
  "paypal.tracking_refused",
  "model.unavailable",
  "rate.limited",
  "upstream.timeout",
  "server.error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface DomainError {
  readonly code: ErrorCode;
  // For logs only; never shown to a person and never holds personal data (CQ-33).
  readonly detail?: string;
}

export const domainError = (code: ErrorCode, detail?: string): DomainError => (detail === undefined ? { code } : { code, detail });

// Status and screen text per code, copied from api/error-codes.yaml. A unit test fails if the two differ.
export const ERROR_INFO: Record<ErrorCode, { readonly status: number; readonly message: string }> = {
  "request.invalid": { status: 400, message: "Something in this request isn't right." },
  "auth.required": { status: 401, message: "Log in with PayPal to continue." },
  "auth.store_key_invalid": { status: 401, message: "This store key isn't valid." },
  not_found: { status: 404, message: "Not found." },
  "cart.other_store": { status: 409, message: "One cart holds one store. Start a new cart?" },
  "cart.version_conflict": { status: 409, message: "This cart changed. Here is the latest one." },
  "cart.not_ready": { status: 422, message: "This cart has items that need attention." },
  "checkout.not_approved": { status: 422, message: "PayPal hasn't approved this payment yet." },
  "product.price_unconfirmed": { status: 409, message: "Confirm a price to publish." },
  "store.slug_taken": { status: 409, message: "That link is taken." },
  "photo.invalid": { status: 415, message: "Use JPEG, PNG, WebP or HEIC up to 10 MB." },
  "pay.link_expired": { status: 410, message: "This payment link ended. Go back to your chat and tap Pay again." },
  "refund.not_allowed": { status: 409, message: "This order can't be refunded now." },
  "paypal.unavailable": { status: 502, message: "PayPal isn't answering. Your cart is saved. Try again." },
  "paypal.refused": { status: 502, message: "PayPal didn't accept this. {reason}" },
  "paypal.tracking_refused": { status: 502, message: "PayPal didn't accept this tracking number. Check it and save again." },
  "model.unavailable": { status: 503, message: "We couldn't read this photo yet. We'll try again." },
  "rate.limited": { status: 429, message: "Too many tries. Wait a minute." },
  "upstream.timeout": { status: 504, message: "This took too long. Nothing was charged. Try again." },
  "server.error": { status: 500, message: "Something went wrong on our side. Nothing was charged." },
};
