import { z } from "zod";
import { domainError, type DomainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { PayPalDeps } from "../paypal/http";

// Log in with PayPal (ADR-008). The seller's PayPal account becomes the payee of their orders.
export const LOGIN_SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";

export function authorizeUrl(baseUrl: string, clientId: string, redirectUri: string, state: string): string {
  const web = baseUrl.includes("sandbox") ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  // Encode with encodeURIComponent, never URLSearchParams: URLSearchParams turns spaces into "+", and PayPal reads
  // "openid+email+…" as one unknown scope, grants only openid, and userinfo then answers 400 invalid_request.
  const q = Object.entries({ flowEntry: "static", client_id: clientId, response_type: "code", scope: LOGIN_SCOPES, redirect_uri: redirectUri, state })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
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

const tokenSchema = z.object({ access_token: z.string().min(1), id_token: z.string().optional(), scope: z.string().optional() });
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
    const res = await deps.fetch(`${deps.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${token.data.access_token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    // PayPal's error name (for example invalid_token or INSUFFICIENT_SCOPE) is not personal data; keep it for the log.
    // PayPal's error name and description (for example "invalid_request: …") hold no personal data.
    const errName = res && !res.ok ? await res.clone().json().then((b: unknown) => {
      const e = b as { error?: string; name?: string; error_description?: string; message?: string } | null;
      return [e?.error ?? e?.name, e?.error_description ?? e?.message].filter(Boolean).join(": ").slice(0, 90);
    }, () => "") : "";
    statuses.push(`${res?.status ?? "network"}${errName ? `:${errName}` : ""}`);
    if (res?.ok) {
      const who = identityFrom(await res.json().catch(() => null));
      if (who.ok) return who;
    }
  }
  // The ID token came straight from PayPal's token endpoint over TLS, so its claims can be read without a
  // signature check (OpenID Connect Core 3.1.3.7). PayPal puts the payer ID and email there for openid scopes.
  const claims = token.data.id_token ? idTokenClaims(token.data.id_token) : null;
  if (claims) {
    const who = identityFrom({ payer_id: claims.payer_id, user_id: claims.sub, email: claims.email, name: claims.name });
    if (who.ok) return who;
  }
  // Which scopes PayPal granted says whether the app's Log in with PayPal settings allow openid and email.
  const scopes = (token.data.scope ?? "").split(/\s+/).filter(Boolean);
  const has = (x: string) => (scopes.some((sc) => sc === x || sc.endsWith(`/${x}`)) ? "y" : "n");
  const granted = `openid:${has("openid")},email:${has("email")},attrs:${has("paypalattributes")},n=${scopes.length}`;
  return err({ ...domainError("paypal.unavailable", `userinfo ${statuses.join(",")} ${token.data.id_token ? "idtoken-unusable" : "no-idtoken"} scopes=${granted}`), step: "userinfo" });
}

function idTokenClaims(jwt: string): { sub?: string; payer_id?: string; email?: string; name?: string } | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4));
    const c = JSON.parse(json) as Record<string, unknown>;
    const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : undefined);
    const out: { sub?: string; payer_id?: string; email?: string; name?: string } = {};
    for (const k of ["sub", "payer_id", "email", "name"] as const) { const v = str(k); if (v !== undefined) out[k] = v; }
    return out;
  } catch {
    return null;
  }
}
