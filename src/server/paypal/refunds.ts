import { z } from "zod";
import type { CaptureId, Cents } from "../domain/brand";
import { toMoney } from "../domain/money";
import { ok, type Result } from "../domain/result";
import { paypalCall, type PayPalDeps, type PayPalFailure } from "./http";

const refundSchema = z.object({ id: z.string(), status: z.enum(["CANCELLED", "FAILED", "PENDING", "COMPLETED"]) });

export interface RefundOutcome {
  readonly paypalRefundId: string;
  readonly status: z.infer<typeof refundSchema>["status"];
}

// Refunds a capture. The caller has already checked INV-05 and INV-07; the request ID makes a retry refund once (SYS-PAY-07).
export async function refundCapture(deps: PayPalDeps, capture: CaptureId, amount: Cents, requestId: string): Promise<Result<RefundOutcome, PayPalFailure>> {
  const res = await paypalCall(deps, {
    method: "POST",
    path: `/v2/payments/captures/${encodeURIComponent(capture)}/refund`,
    body: { amount: toMoney(amount) },
    requestId,
    schema: refundSchema,
  });
  return res.ok ? ok({ paypalRefundId: res.value.id, status: res.value.status }) : res;
}
