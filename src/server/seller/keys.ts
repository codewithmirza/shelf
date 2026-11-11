import { z } from "zod";
import type { StoreId } from "../domain/brand";
import { domainError, type DomainError } from "../domain/errors";
import { prefixedId, type IdSource } from "../domain/ids";
import { err, ok, type Result } from "../domain/result";

// Cart API store keys (SYS-CART-05): shown once, stored only as SHA-256.
export const KEY_PREFIX = "shelf_sk_";

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StoreKeyRow { readonly id: string; readonly label: string; readonly createdAt: string; readonly revokedAt: string | null }

export async function createKey(db: D1Database, ids: IdSource, store: StoreId, body: unknown): Promise<Result<{ key: string; row: StoreKeyRow }, DomainError>> {
  const p = z.object({ label: z.string().trim().min(1).max(40) }).safeParse(body);
  if (!p.success) return err(domainError("request.invalid", "label"));
  const raw = btoa(String.fromCharCode(...ids.randomBytes(24))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const key = `${KEY_PREFIX}${raw}`;
  const id = prefixedId("key", ids);
  const now = new Date(ids.now()).toISOString();
  await db.prepare("INSERT INTO store_keys (id, store_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, store, await sha256Hex(key), p.data.label, now).run();
  return ok({ key, row: { id, label: p.data.label, createdAt: now, revokedAt: null } });
}

export async function listKeys(db: D1Database, store: StoreId): Promise<StoreKeyRow[]> {
  const { results } = await db.prepare("SELECT id, label, created_at, revoked_at FROM store_keys WHERE store_id = ? ORDER BY created_at DESC").bind(store).all<{ id: string; label: string; created_at: string; revoked_at: string | null }>();
  return results.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, revokedAt: r.revoked_at }));
}

export async function revokeKey(db: D1Database, store: StoreId, id: string, now: string): Promise<boolean> {
  return (await db.prepare("UPDATE store_keys SET revoked_at = ? WHERE id = ? AND store_id = ? AND revoked_at IS NULL").bind(now, id, store).run()).meta.changes === 1;
}

// The store a live key belongs to, from the bearer header (TC-CART-05: none or revoked answers 401).
export async function storeForKey(db: D1Database, authorization: string | null): Promise<{ storeId: StoreId; keyId: string; slug: string } | null> {
  const m = authorization?.match(/^Bearer\s+(shelf_sk_[A-Za-z0-9_-]{20,64})$/);
  if (!m) return null;
  const r = await db
    .prepare("SELECT k.id, k.store_id, s.slug FROM store_keys k JOIN stores s ON s.id = k.store_id WHERE k.key_hash = ? AND k.revoked_at IS NULL")
    .bind(await sha256Hex(m[1]!))
    .first<{ id: string; store_id: string; slug: string }>();
  return r ? { storeId: r.store_id as StoreId, keyId: r.id, slug: r.slug } : null;
}
