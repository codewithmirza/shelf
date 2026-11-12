import { signToken } from "@/server/auth/tokens";
import { json, sellerContext } from "@/server/http";
import { waForSeller } from "@/server/whatsapp/chats";
import { displayNumber } from "@/server/whatsapp/graph";
import { whatsappDeps } from "@/server/whatsapp/deps";

// GET /api/seller/whatsapp: is WhatsApp on, and is this seller's number linked (ADR-012).
export async function GET(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const wa = whatsappDeps(c.env);
  const linked = await waForSeller(c.env.DB, c.sellerId);
  return json({ available: Boolean(wa), linked: linked ? `•••${linked.slice(-4)}` : null });
}

// POST /api/seller/whatsapp: a link code valid 15 minutes, and a wa.me link that sends it to Shelf's number.
export async function POST(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const wa = whatsappDeps(c.env);
  if (!wa) return json({ error: { code: "not_found", message: "WhatsApp isn't set up on this Shelf yet." } }, 404);
  const { token, expiresAt } = await signToken(c.env.TOKEN_SECRET, "wa_link", c.sellerId, new Date());
  const text = `LINK ${c.sellerId} ${token}`;
  const number = await displayNumber(wa);
  return json({ text, url: number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null, number, expires_at: expiresAt.toISOString() });
}
