import type { ShelfEnv, WaMessage } from "@/env";
import { verifyToken } from "../auth/tokens";
import { storeId } from "../domain/brand";
import { depsFromEnv as vertexDeps } from "../model/vertex";
import { photoDeps } from "../runtime";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, uploadPhotos } from "../seller/photos";
import { nextHistory, runAgent } from "./agent";
import { buyerSystem, buyerTools } from "./buyer";
import { firstSeen, linkSeller, loadChat, ordersOf, rememberOrder, rememberPhoto, saveChat, sellerForWa, setCart, unlinkWa } from "./chats";
import { whatsappDeps } from "./deps";
import { downloadMedia, markRead, send, type Inbound } from "./graph";
import { callShelfTool } from "./local_mcp";
import { sellerSystem, sellerTools } from "./seller";

// "LINK sel_… v1.…" from the Seller app's Connect WhatsApp button (ADR-012).
const LINK = /^\s*link\s+(sel_[0-9A-Z]{26})\s+(v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/i;

// One inbound WhatsApp message, run from the queue so the agent has time to think (ADR-012).
export async function handleInbound(env: ShelfEnv, ctx: ExecutionContext, m: Inbound): Promise<void> {
  const wa = whatsappDeps(env);
  if (!wa) return;
  const now = () => new Date().toISOString();
  if (!(await firstSeen(env.DB, m.id, now()))) return;
  await markRead(wa, m.id);
  const reply = (body: string) => send(wa, m.from, { kind: "text", body });

  if (m.kind === "text") {
    const link = LINK.exec(m.text);
    if (link) {
      const [, sellerId, token] = link as unknown as [string, string, string];
      const check = await verifyToken(env.TOKEN_SECRET, token, "wa_link", sellerId, new Date());
      if (!check.ok) { await reply("That link code didn't work or has expired. Open the Seller app → Store → Connect WhatsApp to get a new one."); return; }
      await linkSeller(env.DB, m.from, sellerId, now());
      const s = await sellerForWa(env.DB, m.from);
      await reply(`Connected to *${s?.storeName ?? "your store"}*. Send me product photos and I'll draft them. Ask me "my drafts" or "my orders" any time.`);
      return;
    }
    if (/^\s*unlink\s*$/i.test(m.text)) { await unlinkWa(env.DB, m.from); await reply("This number is no longer linked to a Shelf store."); return; }
  }

  const seller = await sellerForWa(env.DB, m.from);

  if (m.kind === "image") {
    if (!seller?.storeId) {
      await reply(`To sell on Shelf, open ${env.PUBLIC_ORIGIN}/app, sign in with PayPal, create your store and tap Connect WhatsApp. Then send me photos.`);
      return;
    }
    const file = await downloadMedia(wa, m.mediaId);
    if (!file || !(file.type in PHOTO_TYPES) || file.bytes.byteLength > MAX_PHOTO_BYTES) {
      await reply("I couldn't read that photo. Send a JPEG or PNG under 10 MB.");
      return;
    }
    const up = await uploadPhotos(photoDeps(env), storeId(seller.storeId), [{ type: file.type, size: file.bytes.byteLength, bytes: async () => file.bytes }]);
    if (!up.ok || !up.value[0]) { await reply("I couldn't save that photo. Try again in a minute."); return; }
    await rememberPhoto(env.DB, up.value[0].id, m.from);
    await reply("Got it. Gemini is drafting this product; I'll send you the draft in a few seconds.");
    return;
  }

  if (m.kind !== "text") { await reply("I can read text messages and product photos."); return; }

  const chat = await loadChat(env.DB, m.from);
  let cartId = chat.cartId;
  const buyer = buyerTools({
    call: (name, args) => callShelfTool(env, ctx, name, args),
    cartId: () => cartId,
    setCartId: async (id) => { cartId = id; await setCart(env.DB, m.from, id, now()); },
    orders: () => ordersOf(env.DB, m.from),
    rememberOrder: (orderId, token) => rememberOrder(env.DB, orderId, m.from, token, now()),
    watchOrder: async (orderId) => { await env.EXTRACTION_QUEUE.send({ kind: "wa_watch", orderId, n: 0 } satisfies WaMessage, { delaySeconds: 20 }); },
  });
  const isSeller = Boolean(seller?.storeId);
  const tools = isSeller ? [...sellerTools(env.DB, storeId(seller!.storeId!), now), ...buyer] : buyer;
  const system = isSeller ? `${sellerSystem(env.PUBLIC_ORIGIN, seller!.storeName ?? "your store", seller!.storeSlug ?? "")}\n\n${buyerSystem(env.PUBLIC_ORIGIN)}` : buyerSystem(env.PUBLIC_ORIGIN);
  const answer = await runAgent(vertexDeps(env), system, chat.history, m.text, tools);
  for (const o of answer.outgoing) await send(wa, m.from, o);
  await reply(answer.text);
  await saveChat(env.DB, m.from, nextHistory(chat.history, m.text, answer.text), cartId, now());
}
