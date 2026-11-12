// Signed tokens for the Pay page link and for reading one order (NFR-SEC-02, THR-06, THR-08).
// Format: v1.<base64url payload>.<base64url HMAC-SHA256>. The kind is signed, so an order token never opens a Pay page.

export type TokenKind = "pay" | "order" | "wa_link";

// A Pay page link lives 30 minutes (NFR-SEC-02). An order token lets the buyer follow the order, so it lives 90 days.
// A WhatsApp link code binds one seller to the number that sends it, within 15 minutes (ADR-012). Its subject is the seller id.
export const TOKEN_TTL_S: Record<TokenKind, number> = { pay: 30 * 60, order: 90 * 24 * 60 * 60, wa_link: 15 * 60 };

interface Payload {
  readonly k: TokenKind;
  readonly o: string;
  readonly e: number;
}

export type TokenCheck = { readonly ok: true; readonly expiresAt: Date } | { readonly ok: false; readonly reason: "malformed" | "bad_signature" | "wrong_kind" | "wrong_order" | "expired" };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("TOKEN_SECRET must be at least 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(secret: string, kind: TokenKind, orderId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const e = Math.floor(now.getTime() / 1000) + TOKEN_TTL_S[kind];
  const body = b64url(enc.encode(JSON.stringify({ k: kind, o: orderId, e } satisfies Payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(`v1.${body}`)));
  return { token: `v1.${body}.${b64url(sig)}`, expiresAt: new Date(e * 1000) };
}

// crypto.subtle.verify compares in constant time.
export async function verifyToken(secret: string, token: string, kind: TokenKind, orderId: string, now: Date): Promise<TokenCheck> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, body, sigText] = parts as [string, string, string];
  const sig = fromB64url(sigText);
  const raw = fromB64url(body);
  if (!sig || !raw) return { ok: false, reason: "malformed" };
  const valid = await crypto.subtle.verify("HMAC", await key(secret), sig, enc.encode(`v1.${body}`));
  if (!valid) return { ok: false, reason: "bad_signature" };
  let p: Payload;
  try { p = JSON.parse(new TextDecoder().decode(raw)) as Payload; } catch { return { ok: false, reason: "malformed" }; }
  if (p.k !== kind) return { ok: false, reason: "wrong_kind" };
  if (p.o !== orderId) return { ok: false, reason: "wrong_order" };
  if (typeof p.e !== "number" || p.e * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, expiresAt: new Date(p.e * 1000) };
}
