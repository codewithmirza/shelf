import { createMcpHandler } from "agents/mcp/server";
// The OpenNext build writes this file; it serves every Next.js route (ADR-001).
// @ts-expect-error .open-next/worker.js exists only after `opennextjs-cloudflare build`.
import openNext from "../.open-next/worker.js";
import type { QueueMessage, ShelfEnv, WaMessage } from "./env";
import { createShelfServer } from "./server/mcp/server";
import { checkoutDeps, mcpDeps, photoDeps } from "./server/runtime";
import { extractPhoto } from "./server/seller/photos";
import { depsFromEnv as vertexDeps, extractProduct } from "./server/model/vertex";
import { reconcile } from "./server/reconcile";
import { parseInbound, signatureValid } from "./server/whatsapp/graph";
import { handleInbound } from "./server/whatsapp/inbound";
import { photoDone, watchOrder } from "./server/whatsapp/notify";
import { LIMITS, checkCaller, checkRate, clientAddress, d1RateStore, sweepRateLimits, tooMany } from "./server/ratelimit";

const MCP_ROUTE = "/mcp";
const WHATSAPP_ROUTE = "/api/whatsapp/webhook";

// PUBLIC_ORIGIN may be empty: then links and photo URLs use the origin this request came to (workers.dev
// or a custom domain). The bindings stay on the prototype, so nothing is copied.
function withOrigin(env: ShelfEnv, origin: string): ShelfEnv {
  return env.PUBLIC_ORIGIN ? env : Object.assign(Object.create(env) as ShelfEnv, { PUBLIC_ORIGIN: origin });
}

export default {
  async fetch(request: Request, rawEnv: ShelfEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const env = withOrigin(rawEnv, url.origin);
    if (url.pathname === MCP_ROUTE) {
      // THR-09: own hostnames only, no cross-site browser calls, and a per-address limit (SYS-MCP-08).
      const caller = checkCaller(request, env.PUBLIC_ORIGIN);
      if (caller !== "ok") return Response.json({ error: { code: "request.invalid", message: "Something in this request isn't right." } }, { status: 403 });
      if (request.method === "POST") {
        const rate = await checkRate(d1RateStore(env.DB), LIMITS.mcp, clientAddress(request), env.TOKEN_SECRET, new Date());
        if (!rate.allowed) return tooMany(rate.retryAfterS);
      }
      // A new handler per request lets the server factory see this request's env, with no session store.
      const handler = createMcpHandler(() => createShelfServer(mcpDeps(env)), { route: MCP_ROUTE });
      return handler(request, env, ctx);
    }
    if (url.pathname === WHATSAPP_ROUTE) return whatsappWebhook(request, env, url);
    return (openNext as ExportedHandler<ShelfEnv>).fetch!(request as never, env, ctx);
  },

  // Each photo becomes a Draft (FL-SEL-02). Three tries in all (wrangler.jsonc max_retries), then Failed.
  // The same queue carries WhatsApp messages and Paid checks (ADR-012); those are never retried, so nobody gets a reply twice.
  async queue(batch: MessageBatch<QueueMessage>, env: ShelfEnv, ctx: ExecutionContext): Promise<void> {
    const deps = photoDeps(env);
    const read = (photo: Parameters<typeof extractProduct>[1]) => extractProduct(vertexDeps(env), photo);
    for (const message of batch.messages) {
      const body = message.body;
      if ("kind" in body) {
        try {
          if (body.kind === "wa_in") await handleInbound(env, ctx, body.message);
          else await watchOrder(env, body);
        } catch (e) {
          console.log(JSON.stringify({ level: "error", job: body.kind, error: String(e).slice(0, 200) }));
        }
        message.ack();
        continue;
      }
      try {
        const step = await extractPhoto(deps, read, body.photoId, message.attempts, 4);
        if (step.kind === "retry") message.retry({ delaySeconds: 10 * message.attempts });
        else {
          message.ack();
          await photoDone(env, body.photoId).catch((e) => console.log(JSON.stringify({ level: "warn", job: "whatsapp.photo", error: String(e).slice(0, 200) })));
        }
      } catch (e) {
        console.log(JSON.stringify({ level: "error", job: "extract", photo: body.photoId, error: String(e).slice(0, 200) }));
        message.retry({ delaySeconds: 15 });
      }
    }
  },

  // Every 5 minutes: agree with PayPal on open orders, cancel unpaid ones, expire old carts (SYS-PAY-09).
  async scheduled(_controller: ScheduledController, env: ShelfEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.all([reconcile(checkoutDeps(env)), sweepRateLimits(env.DB, new Date())]).then(([report, swept]) =>
        console.log(JSON.stringify({ level: "info", job: "reconcile", ...report, rateBucketsSwept: swept })),
      ),
    );
  },
} satisfies ExportedHandler<ShelfEnv, QueueMessage>;

// Meta's webhook (ADR-012). GET is the one-time subscription check; POST is a delivery, signed with the app secret.
// A delivery is queued and answered 200 at once: Meta resends anything that waits, and the agent can take seconds.
async function whatsappWebhook(request: Request, env: ShelfEnv, url: URL): Promise<Response> {
  if (!env.WHATSAPP_APP_SECRET || !env.WHATSAPP_VERIFY_TOKEN) return new Response("WhatsApp is not set up.", { status: 404 });
  if (request.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await request.text();
  if (raw.length > 256_000 || !(await signatureValid(env.WHATSAPP_APP_SECRET, raw, request.headers.get("x-hub-signature-256")))) {
    return new Response("Bad signature", { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const messages = parseInbound(body);
  if (messages.length > 0) await env.EXTRACTION_QUEUE.sendBatch(messages.map((m) => ({ body: { kind: "wa_in", message: m } satisfies WaMessage })));
  return new Response("ok", { status: 200 });
}
