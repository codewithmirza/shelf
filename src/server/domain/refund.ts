import { cents, type Cents } from "./brand";
import { domainError, type DomainError } from "./errors";
import type { OrderState, RefundState } from "./machines";
import { err, ok, type Result } from "./result";

export interface OrderForRefund {
  readonly state: OrderState;
  readonly amountCents: Cents;
  readonly refundedCents: Cents;
}

const REFUNDABLE: readonly OrderState[] = ["captured", "shipped"];

// INV-07: refunds never exceed the captured amount minus earlier refunds.
export function remainingRefundable(order: OrderForRefund): Cents {
  return cents(Math.max(0, order.amountCents - order.refundedCents));
}

// T-RFD-01 with INV-06: a buyer may ask once per order while it is captured or shipped.
export function canRequestRefund(order: OrderForRefund, existing: readonly { state: RefundState }[]): Result<Cents, DomainError> {
  if (!REFUNDABLE.includes(order.state)) return err(domainError("refund.not_allowed", `order is ${order.state}`));
  if (existing.some((r) => r.state === "pending")) return err(domainError("refund.not_allowed", "a request is already pending"));
  const remaining = remainingRefundable(order);
  if (remaining === 0) return err(domainError("refund.not_allowed", "nothing left to refund"));
  return ok(remaining);
}

// Checks an amount the seller approves against INV-07 before any PayPal call.
export function checkRefundAmount(order: OrderForRefund, amount: Cents): Result<Cents, DomainError> {
  if (!REFUNDABLE.includes(order.state)) return err(domainError("refund.not_allowed", `order is ${order.state}`));
  if (amount <= 0 || amount > remainingRefundable(order)) return err(domainError("refund.not_allowed", "amount above the refundable remainder"));
  return ok(amount);
}
