import { z } from "zod";
import type { Turn } from "./agent";

// D1 access for the WhatsApp channel (TAB-15 to TAB-19).

const historySchema = z.array(z.object({ role: z.enum(["user", "model"]), text: z.string() }));

export interface Chat {
  readonly waId: string;
  readonly history: Turn[];
  readonly cartId: string | null;
}

export async function loadChat(db: D1Database, waId: string): Promise<Chat> {
  const r = await db.prepare("SELECT history_json, cart_id FROM wa_chats WHERE wa_id = ?").bind(waId).first<{ history_json: string; cart_id: string | null }>();
  const h = historySchema.safeParse(r ? JSON.parse(r.history_json) : []);
  return { waId, history: h.success ? h.data : [], cartId: r?.cart_id ?? null };
}

export async function saveChat(db: D1Database, waId: string, history: readonly Turn[], cartId: string | null, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO wa_chats (wa_id, history_json, cart_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(wa_id) DO UPDATE SET history_json = excluded.history_json, cart_id = excluded.cart_id, updated_at = excluded.updated_at`,
    )
    .bind(waId, JSON.stringify(history), cartId, now)
    .run();
}

export async function setCart(db: D1Database, waId: string, cartId: string | null, now: string): Promise<void> {
  await db
    .prepare(`INSERT INTO wa_chats (wa_id, cart_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(wa_id) DO UPDATE SET cart_id = excluded.cart_id, updated_at = excluded.updated_at`)
    .bind(waId, cartId, now)
    .run();
}

// True the first time a message ID is seen. Meta can deliver one message more than once.
export async function firstSeen(db: D1Database, messageId: string, now: string): Promise<boolean> {
  const r = await db.prepare("INSERT OR IGNORE INTO wa_seen (message_id, seen_at) VALUES (?, ?)").bind(messageId, now).run();
  return r.meta.changes === 1;
}

export interface LinkedSeller {
  readonly sellerId: string;
  readonly storeId: string | null;
  readonly storeSlug: string | null;
  readonly storeName: string | null;
}

export async function sellerForWa(db: D1Database, waId: string): Promise<LinkedSeller | null> {
  const r = await db
    .prepare("SELECT w.seller_id, s.id AS store_id, s.slug, s.name FROM wa_sellers w LEFT JOIN stores s ON s.seller_id = w.seller_id WHERE w.wa_id = ?")
    .bind(waId)
    .first<{ seller_id: string; store_id: string | null; slug: string | null; name: string | null }>();
  return r ? { sellerId: r.seller_id, storeId: r.store_id, storeSlug: r.slug, storeName: r.name } : null;
}

export async function waForSeller(db: D1Database, sellerId: string): Promise<string | null> {
  const r = await db.prepare("SELECT wa_id FROM wa_sellers WHERE seller_id = ?").bind(sellerId).first<{ wa_id: string }>();
  return r?.wa_id ?? null;
}

// One number per seller and one seller per number: a new link replaces both old rows.
export async function linkSeller(db: D1Database, waId: string, sellerId: string, now: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM wa_sellers WHERE wa_id = ? OR seller_id = ?").bind(waId, sellerId),
    db.prepare("INSERT INTO wa_sellers (wa_id, seller_id, linked_at) VALUES (?, ?, ?)").bind(waId, sellerId, now),
  ]);
}

export async function unlinkWa(db: D1Database, waId: string): Promise<void> {
  await db.prepare("DELETE FROM wa_sellers WHERE wa_id = ?").bind(waId).run();
}

export async function rememberOrder(db: D1Database, orderId: string, waId: string, token: string, now: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO wa_orders (order_id, wa_id, order_token, created_at) VALUES (?, ?, ?, ?)").bind(orderId, waId, token, now).run();
}

export async function ordersOf(db: D1Database, waId: string): Promise<{ orderId: string; token: string }[]> {
  const { results } = await db.prepare("SELECT order_id, order_token FROM wa_orders WHERE wa_id = ? ORDER BY created_at DESC LIMIT 10").bind(waId).all<{ order_id: string; order_token: string }>();
  return results.map((r) => ({ orderId: r.order_id, token: r.order_token }));
}

export async function rememberPhoto(db: D1Database, photoId: string, waId: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO wa_photos (photo_id, wa_id) VALUES (?, ?)").bind(photoId, waId).run();
}
