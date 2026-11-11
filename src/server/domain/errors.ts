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
