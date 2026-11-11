import { z } from "zod";
import { domainError, type DomainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { PayPalDeps } from "../paypal/http";

// Log in with PayPal (ADR-008). The seller's PayPal account becomes the payee of their orders.
export const LOGIN_SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";

export function authorizeUrl(baseUrl: string, clientId: string, redirectUri: string, state: string): string {
  const web = baseUrl.includes("sandbox") ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  const q = new URLSearchParams({ flowEntry: "static", client_id: clientId, response_type: "code", scope: LOGIN_SCOPES, redirect_uri: redirectUri, state });
  // The documented Connect with PayPal endpoint (developer.paypal.com/log-in/build-button).
  return `${web}/connect?${q}`;
}

export interface PayPalIdentity {
  // The payer ID (merchant ID) when PayPal shares it; else the stable user id. It identifies the seller.
  readonly accountId: string;
  // True when accountId is a payer ID, which Orders v2 accepts as payee.merchant_id.
  readonly isPayerId: boolean;
  // Empty when the app's email attribute is not approved yet; payments then go to the payer ID.
  readonly email: string;
  readonly name: string;
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
// Two userinfo schemas exist; read both (ADR-008 point 2).
const userinfoSchema = z.object({
  user_id: z.string().optional(),
  payer_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  emails: z.array(z.object({ value: z.string(), primary: z.boolean().optional() })).optional(),
});

export function identityFrom(info: unknown): Result<PayPalIdentity, DomainError> {
  const p = userinfoSchema.safeParse(info);
  if (!p.success) return err(domainError("paypal.unavailable", "userinfo shape"));
  const accountId = p.data.payer_id ?? p.data.user_id?.split("/").pop();
  const raw = p.data.emails?.find((e) => e.primary)?.value ?? p.data.emails?.[0]?.value ?? p.data.email ?? "";
  const email = raw.includes("@") ? raw.toLowerCase() : "";
  if (!accountId) return err(domainError("paypal.unavailable", "userinfo without an account id"));
  // A seller needs somewhere to be paid: a payer ID, or else an email.
  if (!p.data.payer_id && !email) return err(domainError("paypal.unavailable", "userinfo without payer id or email"));
  return ok({ accountId, isPayerId: Boolean(p.data.payer_id), email, name: (p.data.name ?? (email.split("@")[0] || "Seller")).slice(0, 80) });
}

// Exchanges the code and reads who signed in. Neither call is retried: a code works once.
// The step that failed, for the sign-in page and the log. Never holds a token or personal data.
export type SignInStep = "token" | "userinfo" | "identity";

export async function identityFromCode(deps: PayPalDeps, code: string, redirectUri: string): Promise<Result<PayPalIdentity, DomainError & { step: SignInStep }>> {
  const basic = btoa(`${deps.clientId}:${deps.clientSecret}`);
  const tokenRes = await deps.fetch(`${deps.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenRes) return err({ ...domainError("paypal.unavailable", "token network"), step: "token" });
  const tokenBody = (await tokenRes.json().catch(() => null)) as { error?: string; error_description?: string } | null;
  const token = tokenSchema.safeParse(tokenBody);
  if (!tokenRes.ok || !token.success) return err({ ...domainError("auth.required", `token ${tokenRes.status} ${tokenBody?.error ?? ""}`.trim()), step: "token" });
  const statuses: string[] = [];
  for (const path of ["/v1/identity/oauth2/userinfo?schema=paypalv1.1", "/v1/identity/openidconnect/userinfo?schema=openid"]) {
    const res = await deps.fetch(`${deps.baseUrl}${path}`, { headers: { authorization: `Bearer ${token.data.access_token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    statuses.push(String(res?.status ?? "network"));
    if (res?.ok) {
      const who = identityFrom(await res.json().catch(() => null));
      return who.ok ? who : err({ ...who.error, step: "identity" });
    }
  }
  return err({ ...domainError("paypal.unavailable", `userinfo ${statuses.join(",")}`), step: "userinfo" });
}
