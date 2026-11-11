import { storeId as asStoreId, type StoreId } from "../domain/brand";
import { prefixedId, type IdSource } from "../domain/ids";
import type { PayPalIdentity } from "./paypal_login";

// Seller sessions (NFR-SEC-04): the cookie holds a random id, never the seller id. HttpOnly, Secure, SameSite=Lax, 7 days.
export const SESSION_COOKIE = "__Host-shelf_session";
export const STATE_COOKIE = "__Host-shelf_oauth";
export const SESSION_TTL_S = 7 * 24 * 60 * 60;

export interface Seller {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly storeId: StoreId | null;
}

export interface SessionRepo {
  // Creates the seller on first sign-in; refreshes email and name after that (SYS-SEL-01).
  upsertSeller(identity: PayPalIdentity, newId: string, now: string): Promise<string>;
  createSession(id: string, sellerId: string, expiresAt: string, now: string): Promise<void>;
  sellerForSession(id: string, now: string): Promise<Seller | null>;
  deleteSession(id: string): Promise<void>;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = (ids: IdSource) => b64url(ids.randomBytes(32));

export async function signIn(repo: SessionRepo, ids: IdSource, identity: PayPalIdentity): Promise<{ sessionId: string; sellerId: string }> {
  const now = new Date(ids.now());
  const sellerId = await repo.upsertSeller(identity, prefixedId("sel", ids), now.toISOString());
  const sessionId = randomToken(ids);
  await repo.createSession(sessionId, sellerId, new Date(now.getTime() + SESSION_TTL_S * 1000).toISOString(), now.toISOString());
  return { sessionId, sellerId };
}

export function cookie(name: string, value: string, maxAgeS: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

export function d1SessionRepo(db: D1Database): SessionRepo {
  return {
    async upsertSeller(i, newId, now) {
      const r = await db
        .prepare(
          `INSERT INTO sellers (id, paypal_account_id, paypal_email, display_name, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(paypal_account_id) DO UPDATE SET paypal_email = excluded.paypal_email, display_name = excluded.display_name RETURNING id`,
        )
        .bind(newId, i.accountId, i.email, i.name, now)
        .first<{ id: string }>();
      return r!.id;
    },
    async createSession(id, sellerId, expiresAt, now) {
      await db.prepare("INSERT INTO sessions (id, seller_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(id, sellerId, expiresAt, now).run();
    },
    async sellerForSession(id, now) {
      const r = await db
        .prepare(
          `SELECT se.id, se.paypal_email, se.display_name, st.id AS store_id FROM sessions s JOIN sellers se ON se.id = s.seller_id
           LEFT JOIN stores st ON st.seller_id = se.id WHERE s.id = ? AND s.expires_at > ?`,
        )
        .bind(id, now)
        .first<{ id: string; paypal_email: string; display_name: string; store_id: string | null }>();
      return r ? { id: r.id, email: r.paypal_email, name: r.display_name, storeId: r.store_id ? asStoreId(r.store_id) : null } : null;
    },
    async deleteSession(id) {
      await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    },
  };
}
