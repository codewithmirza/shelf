import { z } from "zod";
import { captureId as asCaptureId, paypalOrderId as asPayPalOrderId, type CaptureId, type Cents, type PayPalOrderId } from "../domain/brand";
import { parseMoneyValue, toMoney } from "../domain/money";
import { err, ok, type Result } from "../domain/result";
import { domainError } from "../domain/errors";
import { paypalCall, type PayPalDeps, type PayPalFailure } from "./http";

const linkSchema = z.object({ href: z.string(), rel: z.string() });
const moneySchema = z.object({ currency_code: z.string(), value: z.string() });

const orderSchema = z.object({
  id: z.string(),
  status: z.enum(["CREATED", "SAVED", "APPROVED", "VOIDED", "COMPLETED", "PAYER_ACTION_REQUIRED"]),
  links: z.array(linkSchema).optional(),
  payer: z.object({ email_address: z.string().optional() }).optional(),
  purchase_units: z
    .array(
      z.object({
        shipping: z.object({ name: z.object({ full_name: z.string() }).partial().optional(), address: z.record(z.string(), z.string()).optional() }).optional(),
        payments: z.object({ captures: z.array(z.object({ id: z.string(), status: z.string(), amount: moneySchema })).optional() }).optional(),
      }),
    )
    .optional(),
});

export type PayPalOrderStatus = z.infer<typeof orderSchema>["status"];

export interface OrderLineForPayPal {
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
}

export interface CreateOrderInput {
  // Our cart ID as the PayPal reference_id, so a support person can find the cart from PayPal.
  // No order ID is sent: a retry with the same request ID must send the same body.
  readonly cartId: string;
  readonly payeeEmail: string;
  readonly storeName: string;
  readonly lines: readonly OrderLineForPayPal[];
  readonly subtotalCents: Cents;
  readonly shippingCents: Cents;
  readonly totalCents: Cents;
  readonly returnUrl: string;
  readonly cancelUrl: string;
  readonly requestId: string;
}

export interface CreatedOrder {
  readonly paypalOrderId: PayPalOrderId;
  readonly status: PayPalOrderStatus;
  readonly approveUrl: string | null;
}

// Orders v2, intent CAPTURE, USD, the seller as payee (SYS-PAY-02). PayPal's item names stop at 127 characters.
export async function createOrder(deps: PayPalDeps, input: CreateOrderInput): Promise<Result<CreatedOrder, PayPalFailure>> {
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.cartId,
        payee: { email_address: input.payeeEmail },
        amount: { ...toMoney(input.totalCents), breakdown: { item_total: toMoney(input.subtotalCents), shipping: toMoney(input.shippingCents) } },
        items: input.lines.map((l) => ({ name: l.name.slice(0, 127), sku: l.sku, quantity: String(l.quantity), unit_amount: toMoney(l.unitPriceCents), category: "PHYSICAL_GOODS" })),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: input.storeName.slice(0, 127),
          shipping_preference: "GET_FROM_FILE",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  };
  const res = await paypalCall(deps, { method: "POST", path: "/v2/checkout/orders", body, requestId: input.requestId, schema: orderSchema });
  if (!res.ok) return res;
  const approve = res.value.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  return ok({ paypalOrderId: asPayPalOrderId(res.value.id), status: res.value.status, approveUrl: approve?.href ?? null });
}

export interface OrderSnapshot {
  readonly status: PayPalOrderStatus;
  readonly capture: { readonly id: CaptureId; readonly amountCents: Cents; readonly status: string } | null;
  readonly payerEmail: string | null;
  readonly shipping: unknown;
}

function snapshot(order: z.infer<typeof orderSchema>): Result<OrderSnapshot, PayPalFailure> {
  const unit = order.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  let capture: OrderSnapshot["capture"] = null;
  if (cap) {
    const amount = parseMoneyValue(cap.amount.value);
    if (amount === null || cap.amount.currency_code !== "USD") return err(domainError("paypal.unavailable", "capture amount"));
    capture = { id: asCaptureId(cap.id), amountCents: amount, status: cap.status };
  }
  return ok({ status: order.status, capture, payerEmail: order.payer?.email_address ?? null, shipping: unit?.shipping ?? null });
}

// The reconciler and the webhook read the truth from PayPal with this call (CQ-31, SYS-PAY-09).
export async function getOrder(deps: PayPalDeps, id: PayPalOrderId): Promise<Result<OrderSnapshot, PayPalFailure>> {
  const res = await paypalCall(deps, { method: "GET", path: `/v2/checkout/orders/${encodeURIComponent(id)}`, schema: orderSchema });
  return res.ok ? snapshot(res.value) : res;
}

// Captures once: the request ID makes a repeated capture return the first result (INV-04).
export async function captureOrder(deps: PayPalDeps, id: PayPalOrderId, requestId: string): Promise<Result<OrderSnapshot, PayPalFailure>> {
  const res = await paypalCall(deps, { method: "POST", path: `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, body: {}, requestId, schema: orderSchema });
  return res.ok ? snapshot(res.value) : res;
}

// Sends tracking for a captured order (SYS-PAY-08).
export async function addTracking(
  deps: PayPalDeps,
  input: { paypalOrderId: PayPalOrderId; captureId: CaptureId; carrier: string; trackingNumber: string; requestId: string },
): Promise<Result<true, PayPalFailure>> {
  const res = await paypalCall(deps, {
    method: "POST",
    path: `/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}/track`,
    body: { capture_id: input.captureId, tracking_number: input.trackingNumber, carrier: input.carrier, notify_payer: false },
    requestId: input.requestId,
    schema: z.unknown(),
  });
  if (!res.ok) return err({ ...res.error, code: "paypal.tracking_refused" });
  return ok(true);
}
