// Fixed-window rate limits in D1 (THR-09, SYS-MCP-08). The client address is stored only as a keyed hash.

export interface Limit {
  readonly name: "mcp" | "try";
  readonly max: number;
  readonly windowMs: number;
}

// TC-MCP-06: the 301st MCP call in a minute from one address gets 429. Hosts like Claude call from a few
// shared server addresses, and one open checkout polls 20 times a minute, so 60 would throttle real buyers.
export const LIMITS = {
  mcp: { name: "mcp", max: 300, windowMs: 60_000 },
  try: { name: "try", max: 30, windowMs: 60 * 60_000 },
} as const satisfies Record<string, Limit>;

export interface RateStore {
  // Adds one to the bucket and returns the new count; the bucket ends at `expiresAt`.
  hit(bucket: string, expiresAt: string): Promise<number>;
}

export type RateDecision = { readonly allowed: true; readonly remaining: number } | { readonly allowed: false; readonly retryAfterS: number };

async function addressKey(secret: string, address: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(address)));
  return [...mac.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkRate(store: RateStore, limit: Limit, address: string, secret: string, now: Date): Promise<RateDecision> {
  const window = Math.floor(now.getTime() / limit.windowMs);
  const end = (window + 1) * limit.windowMs;
  const count = await store.hit(`${limit.name}:${await addressKey(secret, address)}:${window}`, new Date(end).toISOString());
  if (count > limit.max) return { allowed: false, retryAfterS: Math.max(1, Math.ceil((end - now.getTime()) / 1000)) };
  return { allowed: true, remaining: limit.max - count };
}

// The MCP endpoint answers only for its own hostnames, and refuses browser calls from other sites.
// Claude and ChatGPT call from their servers (no Origin header); the Try page calls from our origin.
export function checkCaller(request: Request, ownOrigin: string): "ok" | "wrong_host" | "wrong_origin" {
  const url = new URL(request.url);
  const own = new URL(ownOrigin);
  if (url.host !== own.host) return "wrong_host";
  const origin = request.headers.get("origin");
  if (origin && origin !== own.origin && origin !== "null") return "wrong_origin";
  return "ok";
}

export const clientAddress = (request: Request) => request.headers.get("cf-connecting-ip") ?? "unknown";

export function d1RateStore(db: D1Database): RateStore {
  return {
    async hit(bucket, expiresAt) {
      const r = await db
        .prepare("INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count")
        .bind(bucket, expiresAt)
        .first<{ count: number }>();
      return r?.count ?? 1;
    },
  };
}

export async function sweepRateLimits(db: D1Database, now: Date): Promise<number> {
  return (await db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now.toISOString()).run()).meta.changes;
}

export function tooMany(retryAfterS: number): Response {
  return Response.json({ error: { code: "rate.limited", message: "Too many tries. Wait a minute." } }, { status: 429, headers: { "retry-after": String(retryAfterS), "cache-control": "no-store" } });
}
