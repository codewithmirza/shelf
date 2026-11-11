import { z } from "zod";
import { cents, variantId, type Cents, type StoreId, type VariantId } from "./brand";
import { domainError, type DomainError } from "./errors";
import { addCents, multiplyCents } from "./money";
import { err, ok, type Result } from "./result";
import type { CartState } from "./machines";

export const MAX_QUANTITY = 10;
export const MAX_LINES = 20;

// What a buyer or agent may send. Nothing about price: the server ignores any amount a caller sends (INV-01).
const cartInputSchema = z.object({
  items: z
    .array(z.object({ variant_id: z.string().min(1).max(64), quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .max(MAX_LINES),
});

export interface CartItemInput {
  readonly variantId: VariantId;
  readonly quantity: number;
}

// Parse, don't validate (CQ-21): after this line no code sees the raw body.
export function parseCartInput(body: unknown): Result<readonly CartItemInput[], DomainError> {
  const parsed = cartInputSchema.safeParse(body);
  if (!parsed.success) return err(domainError("request.invalid", parsed.error.issues.map((i) => i.path.join(".")).join(",")));
  return ok(parsed.data.items.map((i) => ({ variantId: variantId(i.variant_id), quantity: i.quantity })));
}

// The stored facts pricing needs. The caller reads them from D1; pricing never does I/O (CQ-26).
export interface VariantForPricing {
  readonly id: VariantId;
  readonly storeId: StoreId;
  readonly productTitle: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: Cents | null;
  readonly stock: number;
  readonly published: boolean;
}

export interface StoreForPricing {
  readonly id: StoreId;
  readonly shippingCents: Cents;
}

export type ValidationIssueCode = "OUT_OF_STOCK" | "PRICE_CHANGED" | "UNPUBLISHED" | "OTHER_STORE" | "QUANTITY_LIMIT" | "NOT_FOUND";

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly variantId: VariantId;
  readonly message: string;
}

export interface PricedLine {
  readonly variantId: VariantId;
  readonly title: string;
  readonly options: Readonly<Record<string, string>>;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
  readonly lineTotalCents: Cents;
}

export interface PricedCart {
  readonly lines: readonly PricedLine[];
  readonly issues: readonly ValidationIssue[];
  readonly subtotalCents: Cents;
  readonly shippingCents: Cents;
  readonly totalCents: Cents;
  // T-CRT-01 or T-CRT-02: ready only with at least one line and no issue.
  readonly state: Extract<CartState, "ready" | "incomplete">;
}

const ISSUE_TEXT: Record<ValidationIssueCode, string> = {
  OUT_OF_STOCK: "This item sold out. It is not in your total.",
  PRICE_CHANGED: "The price changed. Check the new total.",
  UNPUBLISHED: "This item is no longer for sale.",
  OTHER_STORE: "One cart holds one store.",
  QUANTITY_LIMIT: "Fewer are left than you asked for.",
  NOT_FOUND: "This item does not exist.",
};

// Prices a cart from stored values only (INV-01) and for one store only (INV-02).
export function priceCart(
  items: readonly CartItemInput[],
  store: StoreForPricing,
  variants: ReadonlyMap<VariantId, VariantForPricing>,
): PricedCart {
  // The same variant twice in one request is one line: quantities add up.
  const merged = new Map<VariantId, number>();
  for (const item of items) merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity);

  const lines: PricedLine[] = [];
  const issues: ValidationIssue[] = [];
  const issue = (code: ValidationIssueCode, id: VariantId) => issues.push({ code, variantId: id, message: ISSUE_TEXT[code] });

  for (const [id, quantity] of merged) {
    const variant = variants.get(id);
    if (!variant) { issue("NOT_FOUND", id); continue; }
    if (variant.storeId !== store.id) { issue("OTHER_STORE", id); continue; }
    if (!variant.published || variant.priceCents === null) { issue("UNPUBLISHED", id); continue; }
    if (variant.stock === 0) { issue("OUT_OF_STOCK", id); continue; }
    if (quantity > MAX_QUANTITY || quantity > variant.stock) { issue("QUANTITY_LIMIT", id); continue; }
    lines.push({
      variantId: id,
      title: variant.productTitle,
      options: variant.options,
      quantity,
      unitPriceCents: variant.priceCents,
      lineTotalCents: multiplyCents(variant.priceCents, quantity),
    });
  }

  const subtotalCents = lines.reduce((sum, l) => addCents(sum, l.lineTotalCents), cents(0));
  // Shipping is charged once per order, and only when something ships.
  const shippingCents = lines.length > 0 ? store.shippingCents : cents(0);
  const state = lines.length > 0 && issues.length === 0 ? "ready" : "incomplete";
  return { lines, issues, subtotalCents, shippingCents, totalCents: addCents(subtotalCents, shippingCents), state };
}
