import type { Cents } from "./brand";
import { domainError, type DomainError } from "./errors";
import { productMachine, type ProductState } from "./machines";
import { err, ok, type Result } from "./result";

export interface ProductForPublish {
  readonly state: ProductState;
  readonly variants: readonly { readonly priceCents: Cents | null }[];
}

// T-PRD-02 with INV-03: publish only when every variant has a price the seller confirmed.
export function checkPublish(product: ProductForPublish): Result<"published", DomainError> {
  if (!productMachine.canMove(product.state, "published", "seller")) return err(domainError("request.invalid", `product is ${product.state}`));
  if (product.variants.length === 0 || product.variants.some((v) => v.priceCents === null)) return err(domainError("product.price_unconfirmed"));
  return ok("published");
}

export const MIN_PRICE_CENTS = 50;
export const MAX_PRICE_CENTS = 1_000_000;

// FC-SEL-03-01: a price is between $0.50 and $10,000.
export function checkPrice(value: number): Result<number, DomainError> {
  return Number.isSafeInteger(value) && value >= MIN_PRICE_CENTS && value <= MAX_PRICE_CENTS ? ok(value) : err(domainError("request.invalid", "price out of range"));
}
