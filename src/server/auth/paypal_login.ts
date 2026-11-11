import { z } from "zod";
import { domainError, type DomainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { PayPalDeps } from "../paypal/http";

// Log in with PayPal (ADR-008). The seller's PayPal account becomes the payee of their orders.
export const LOGIN_SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";

export function authorizeUrl(baseUrl: string, clientId: string, redirectUri: string, state: string): string {
  const web = baseUrl.includes("sandbox") ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  const q = new URLSearchParams({ flowEntry: "static", client_id: clientId, response_type: "code", scope: LOGIN_SCOPES, redirect_uri: redirectUri, state });
  return `${web}/signin/authorize?${q}`;
}

export interface PayPalIdentity {
  readonly accountId: string;
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
  const email = p.data.emails?.find((e) => e.primary)?.value ?? p.data.emails?.[0]?.value ?? p.data.email;
  if (!accountId || !email || !email.includes("@")) return err(domainError("paypal.unavailable", "userinfo without id or email"));
  return ok({ accountId, email: email.toLowerCase(), name: (p.data.name ?? email.split("@")[0] ?? "Seller").slice(0, 80) });
}

// Exchanges the code and reads who signed in. Neither call is retried: a code works once.
export async function identityFromCode(deps: PayPalDeps, code: string, redirectUri: string): Promise<Result<PayPalIdentity, DomainError>> {
  const basic = btoa(`${deps.clientId}:${deps.clientSecret}`);
  const tokenRes = await deps.fetch(`${deps.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenRes) return err(domainError("paypal.unavailable", "token network"));
  const token = tokenSchema.safeParse(await tokenRes.json().catch(() => null));
  if (!tokenRes.ok || !token.success) return err(domainError("auth.required", `token ${tokenRes.status}`));
  for (const path of ["/v1/identity/oauth2/userinfo?schema=paypalv1.1", "/v1/identity/openidconnect/userinfo?schema=openid"]) {
    const res = await deps.fetch(`${deps.baseUrl}${path}`, { headers: { authorization: `Bearer ${token.data.access_token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (res?.ok) return identityFrom(await res.json().catch(() => null));
  }
  return err(domainError("paypal.unavailable", "userinfo"));
}
