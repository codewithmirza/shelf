import { z } from "zod";
import { ok, err, type Result } from "../domain/result";
import { domainError } from "../domain/errors";
import { paypalCall, type PayPalDeps, type PayPalFailure } from "./http";

// The five events Shelf subscribes to (Gate 5, "PayPal webhooks").
export const WEBHOOK_EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
  "CHECKOUT.ORDER.VOIDED",
] as const;

export const webhookEventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string(),
  resource: z.record(z.string(), z.unknown()),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const TRANSMISSION_HEADERS = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"] as const;

// Asks PayPal whether the webhook is genuine. No state changes until this says SUCCESS (SYS-PAY-04, THR-02).
// `original` must be the event exactly as PayPal sent it: PayPal checks the signature over the full body,
// and a parsed copy without unknown fields would always fail.
export async function verifyWebhook(deps: PayPalDeps, webhookId: string, headers: Headers, original: unknown): Promise<Result<true, PayPalFailure>> {
  const h: Record<string, string> = {};
  for (const name of TRANSMISSION_HEADERS) {
    const value = headers.get(name);
    if (!value) return err(domainError("request.invalid", `missing ${name}`));
    h[name] = value;
  }
  const res = await paypalCall(deps, {
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: h["paypal-auth-algo"],
      cert_url: h["paypal-cert-url"],
      transmission_id: h["paypal-transmission-id"],
      transmission_sig: h["paypal-transmission-sig"],
      transmission_time: h["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: original,
    },
    schema: z.object({ verification_status: z.enum(["SUCCESS", "FAILURE"]) }),
  });
  if (!res.ok) return res;
  return res.value.verification_status === "SUCCESS" ? ok(true) : err(domainError("request.invalid", "signature failed"));
}
