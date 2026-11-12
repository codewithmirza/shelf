import type { ShelfEnv, WaMessage } from "@/env";
import { formatUsd } from "../domain/money";
import { cents } from "../domain/brand";
import { send } from "./graph";
import { waForSeller } from "./chats";
import { whatsappDeps } from "./deps";

// Messages Shelf starts on WhatsApp: "Paid" for the buyer and "New order" for the seller, and a drafted product.
// Free-form messages reach a person within 24 hours of their last message to Shelf, which covers these moments.

export const WATCH_EVERY_S = 20;
export const WATCH_MAX = 100; // about 33 minutes: the Pay link lasts 30.

export async function watchOrder(env: ShelfEnv, m: Extract<WaMessage, { kind: "wa_watch" }>): Promise<void> {
  const wa = whatsappDeps(env);
  if (!wa) return;
  const o = await env.DB
    .prepare(
      `SELECT o.state, o.amount_cents, w.wa_id, w.notified_at, s.name AS store_name, s.seller_id
       FROM wa_orders w JOIN orders o ON o.id = w.order_id JOIN stores s ON s.id = o.store_id WHERE w.order_id = ?`,
    )
    .bind(m.orderId)
    .first<{ state: string; amount_cents: number; wa_id: string; notified_at: string | null; store_name: string; seller_id: string }>();
  if (!o || o.notified_at) return;
  if (o.state === "captured" || o.state === "shipped") {
    // Claim the notice first, so two deliveries of this message send it once.
    const claim = await env.DB.prepare("UPDATE wa_orders SET notified_at = ? WHERE order_id = ? AND notified_at IS NULL").bind(new Date().toISOString(), m.orderId).run();
    if (claim.meta.changes !== 1) return;
    await send(wa, o.wa_id, { kind: "text", body: `✅ *Paid.* PayPal confirmed ${formatUsd(cents(o.amount_cents))} to ${o.store_name}. Order ${m.orderId}.\nAsk me "where is my order" any time.` });
    const sellerWa = await waForSeller(env.DB, o.seller_id);
    if (sellerWa) await send(wa, sellerWa, { kind: "text", body: `🛍️ *New order* for ${formatUsd(cents(o.amount_cents))}, paid with PayPal. Order ${m.orderId}.\nShip it and add tracking in the Seller app: ${env.PUBLIC_ORIGIN}/app/orders/${m.orderId}` });
    return;
  }
  if ((o.state === "created" || o.state === "approved") && m.n < WATCH_MAX) {
    await env.EXTRACTION_QUEUE.send({ kind: "wa_watch", orderId: m.orderId, n: m.n + 1 } satisfies WaMessage, { delaySeconds: WATCH_EVERY_S });
  }
}

// After the extraction consumer finished a photo a seller sent on WhatsApp.
export async function photoDone(env: ShelfEnv, photoId: string): Promise<void> {
  const wa = whatsappDeps(env);
  if (!wa) return;
  const row = await env.DB
    .prepare(
      `SELECT w.wa_id, p.state AS photo_state, p.failure_reason, pr.id AS product_id, pr.title, pr.suggested_min_cents AS lo, pr.suggested_max_cents AS hi
       FROM wa_photos w JOIN photos p ON p.id = w.photo_id LEFT JOIN products pr ON pr.id = p.product_id WHERE w.photo_id = ? AND w.notified_at IS NULL`,
    )
    .bind(photoId)
    .first<{ wa_id: string; photo_state: string; failure_reason: string | null; product_id: string | null; title: string | null; lo: number | null; hi: number | null }>();
  if (!row || row.photo_state === "queued") return;
  const claim = await env.DB.prepare("UPDATE wa_photos SET notified_at = ? WHERE photo_id = ? AND notified_at IS NULL").bind(new Date().toISOString(), photoId).run();
  if (claim.meta.changes !== 1) return;
  if (row.product_id && row.title) {
    const { results } = await env.DB.prepare("SELECT options_json FROM variants WHERE product_id = ? ORDER BY position").bind(row.product_id).all<{ options_json: string }>();
    const options = results.map((v) => Object.values(JSON.parse(v.options_json) as Record<string, string>).join(", ")).filter(Boolean);
    const range = row.lo !== null && row.hi !== null ? `\nGemini suggests ${formatUsd(cents(row.lo))} to ${formatUsd(cents(row.hi))}. That's only a suggestion; you set the price.` : "";
    await send(wa, row.wa_id, {
      kind: "text",
      body: `📝 Draft ready: *${row.title}*${options.length ? `\nOptions: ${options.join(" · ")}` : ""}${range}\n\nReply with your price, for example "${row.title.split(" ").slice(0, 3).join(" ")}: $12 each, publish".`,
    });
    return;
  }
  await send(wa, row.wa_id, {
    kind: "text",
    body: row.photo_state === "no_product"
      ? "I couldn't see a product in that photo. Try one product on a plain background."
      : `I couldn't draft that photo${row.failure_reason ? ` (${row.failure_reason})` : ""}. You can fill it in yourself in the Seller app: ${env.PUBLIC_ORIGIN}/app/photos`,
  });
}
