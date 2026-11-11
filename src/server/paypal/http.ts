import type { z } from "zod";
import { domainError, type DomainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";

// What the PayPal client needs from outside. Tests pass a fake fetch and a fake sleep (CQ-26).
export interface PayPalDeps {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export const TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 2;

export interface PayPalRequest<S extends z.ZodType> {
  readonly method: "GET" | "POST" | "PATCH";
  readonly path: string;
  readonly body?: unknown;
  // Required on every create, capture, refund and tracking call (CQ-27, SYS-PAY-03).
  readonly requestId?: string;
  readonly schema: S;
}

// A failure PayPal reported, kept for logs; never shown to a person (CQ-32).
export interface PayPalFailure extends DomainError {
  readonly status?: number;
  readonly paypalName?: string;
}

const transient = (status: number) => status === 429 || status >= 500;

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

// Client-credentials token, reused until 60 s before it expires.
export async function accessToken(deps: PayPalDeps, now: () => number = Date.now): Promise<Result<string, PayPalFailure>> {
  const key = `${deps.baseUrl}|${deps.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt - 60_000 > now()) return ok(cachedToken.value);
  const res = await send(deps, `${deps.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${deps.clientId}:${deps.clientSecret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return res;
  const json = (await res.value.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!json || typeof json.access_token !== "string" || typeof json.expires_in !== "number") return err({ ...domainError("paypal.unavailable", "token response shape"), status: res.value.status });
  cachedToken = { value: json.access_token, expiresAt: now() + json.expires_in * 1000, key };
  return ok(json.access_token);
}

export function resetTokenCacheForTests(): void {
  cachedToken = null;
}

// One HTTP attempt loop: timeout, bounded retries on transient failures only, same headers on every attempt (CQ-29).
async function send(deps: PayPalDeps, url: string, init: RequestInit): Promise<Result<Response, PayPalFailure>> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      if (attempt < MAX_RETRIES) { await deps.sleep(backoff(attempt)); continue; }
      return err(domainError(timedOut ? "upstream.timeout" : "paypal.unavailable", "network"));
    }
    if (transient(response.status) && attempt < MAX_RETRIES) { await deps.sleep(backoff(attempt)); continue; }
    if (transient(response.status)) return err({ ...domainError("paypal.unavailable", `status ${response.status}`), status: response.status });
    return ok(response);
  }
}

const backoff = (attempt: number) => 250 * 2 ** attempt;

// Calls PayPal and parses the answer into a typed value (CQ-21). A 4xx is never retried.
export async function paypalCall<S extends z.ZodType>(deps: PayPalDeps, req: PayPalRequest<S>): Promise<Result<z.infer<S>, PayPalFailure>> {
  const token = await accessToken(deps);
  if (!token.ok) return token;
  const headers: Record<string, string> = { authorization: `Bearer ${token.value}`, "content-type": "application/json", prefer: "return=representation" };
  if (req.requestId) headers["paypal-request-id"] = req.requestId;
  const init: RequestInit = { method: req.method, headers };
  if (req.body !== undefined) init.body = JSON.stringify(req.body);
  const res = await send(deps, `${deps.baseUrl}${req.path}`, init);
  if (!res.ok) return res;
  const text = await res.value.text();
  const json: unknown = text ? safeJson(text) : {};
  if (!res.value.ok) {
    const name = typeof json === "object" && json !== null && "name" in json && typeof json.name === "string" ? json.name : undefined;
    const failure: PayPalFailure = { ...domainError("paypal.refused", name ?? `status ${res.value.status}`), status: res.value.status };
    return err(name ? { ...failure, paypalName: name } : failure);
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) return err({ ...domainError("paypal.unavailable", `unexpected answer for ${req.method} ${req.path}`), status: res.value.status });
  return ok(parsed.data);
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

export function depsFromEnv(env: { PAYPAL_BASE: string; PAYPAL_CLIENT_ID: string; PAYPAL_CLIENT_SECRET: string }): PayPalDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    baseUrl: env.PAYPAL_BASE,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
  };
}
