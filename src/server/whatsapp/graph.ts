import { z } from "zod";

// The WhatsApp Cloud API (Meta Graph API). The only module that talks to Meta (ADR-012).
export const GRAPH = "https://graph.facebook.com/v27.0";

export interface WhatsAppDeps {
  readonly fetch: typeof fetch;
  readonly token: string;
  readonly phoneNumberId: string;
}

export type Outgoing =
  | { readonly kind: "text"; readonly body: string }
  | { readonly kind: "image"; readonly link: string; readonly caption: string };

// WhatsApp text bodies stop at 4096 characters, captions at 1024.
export function messageBody(to: string, m: Outgoing): unknown {
  return m.kind === "text"
    ? { messaging_product: "whatsapp", to, type: "text", text: { body: m.body.slice(0, 4096), preview_url: true } }
    : { messaging_product: "whatsapp", to, type: "image", image: { link: m.link, caption: m.caption.slice(0, 1024) } };
}

// Returns false instead of throwing: a reply that does not go out must not fail the webhook (Meta would resend).
export async function send(d: WhatsAppDeps, to: string, m: Outgoing): Promise<boolean> {
  const res = await d
    .fetch(`${GRAPH}/${d.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
      body: JSON.stringify(messageBody(to, m)),
      signal: AbortSignal.timeout(10_000),
    })
    .catch(() => null);
  if (!res?.ok) {
    const detail = res ? (await res.text().catch(() => "")).slice(0, 200) : "network";
    console.log(JSON.stringify({ level: "warn", job: "whatsapp.send", status: res?.status ?? 0, detail }));
    return false;
  }
  return true;
}

// Marks the buyer's message read and shows "typing…" while the agent works.
export async function markRead(d: WhatsAppDeps, messageId: string): Promise<void> {
  await d
    .fetch(`${GRAPH}/${d.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
      signal: AbortSignal.timeout(5_000),
    })
    .catch(() => null);
}

const mediaSchema = z.object({ url: z.string().url(), mime_type: z.string(), file_size: z.number().optional() });

// A photo the seller sent: Meta gives a short-lived URL that needs the same token.
export async function downloadMedia(d: WhatsAppDeps, mediaId: string): Promise<{ type: string; bytes: ArrayBuffer } | null> {
  const meta = await d.fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: { authorization: `Bearer ${d.token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const m = mediaSchema.safeParse(meta?.ok ? await meta.json().catch(() => null) : null);
  if (!m.success) return null;
  const file = await d.fetch(m.data.url, { headers: { authorization: `Bearer ${d.token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!file?.ok) return null;
  return { type: m.data.mime_type.split(";")[0]!.trim(), bytes: await file.arrayBuffer() };
}

// The business number buyers and sellers write to, for wa.me links. Null when Meta does not answer.
export async function displayNumber(d: WhatsAppDeps): Promise<string | null> {
  const res = await d.fetch(`${GRAPH}/${d.phoneNumberId}?fields=display_phone_number`, { headers: { authorization: `Bearer ${d.token}` }, signal: AbortSignal.timeout(5_000) }).catch(() => null);
  const body = res?.ok ? ((await res.json().catch(() => null)) as { display_phone_number?: string } | null) : null;
  const digits = body?.display_phone_number?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : null;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// X-Hub-Signature-256 is HMAC-SHA256 of the raw body with the app secret. Compared in constant time.
export async function signatureValid(appSecret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const got = header.slice(7).toLowerCase();
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// The parts of a webhook delivery Shelf reads. Statuses (sent, delivered, read) are ignored.
const inboundSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
                  button: z.object({ text: z.string() }).optional(),
                  interactive: z.unknown().optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type Inbound =
  | { readonly id: string; readonly from: string; readonly kind: "text"; readonly text: string }
  | { readonly id: string; readonly from: string; readonly kind: "image"; readonly mediaId: string; readonly caption: string }
  | { readonly id: string; readonly from: string; readonly kind: "other" };

export function parseInbound(body: unknown): Inbound[] {
  const p = inboundSchema.safeParse(body);
  if (!p.success) return [];
  const out: Inbound[] = [];
  for (const e of p.data.entry) for (const c of e.changes) for (const m of c.value.messages ?? []) {
    const from = m.from.replace(/\D/g, "");
    if (m.type === "text" && m.text) out.push({ id: m.id, from, kind: "text", text: m.text.body.slice(0, 1000) });
    else if (m.type === "button" && m.button) out.push({ id: m.id, from, kind: "text", text: m.button.text.slice(0, 200) });
    else if (m.type === "image" && m.image) out.push({ id: m.id, from, kind: "image", mediaId: m.image.id, caption: (m.image.caption ?? "").slice(0, 500) });
    else out.push({ id: m.id, from, kind: "other" });
  }
  return out;
}
