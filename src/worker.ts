import { createMcpHandler } from "agents/mcp/server";
// The OpenNext build writes this file; it serves every Next.js route (ADR-001).
// @ts-expect-error .open-next/worker.js exists only after `opennextjs-cloudflare build`.
import openNext from "../.open-next/worker.js";
import type { ExtractionMessage, ShelfEnv } from "./env";
import { createShelfServer } from "./server/mcp/server";
import { d1Catalog } from "./server/catalog";
import { VERSION } from "./version";

const MCP_ROUTE = "/mcp";

export default {
  async fetch(request: Request, env: ShelfEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === MCP_ROUTE) {
      // A new handler per request lets the server factory see this request's env, with no session store.
      const handler = createMcpHandler(() => createShelfServer({ catalog: d1Catalog(env.DB), origin: env.PUBLIC_ORIGIN, version: VERSION }), { route: MCP_ROUTE });
      return handler(request, env, ctx);
    }
    return (openNext as ExportedHandler<ShelfEnv>).fetch!(request as never, env, ctx);
  },

  // Reads each queued photo and drafts a product (task T-16).
  async queue(batch: MessageBatch<ExtractionMessage>, _env: ShelfEnv, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) message.retry();
  },

  // Every 5 minutes: reconcile orders with PayPal and expire old carts (task T-11).
  async scheduled(_controller: ScheduledController, _env: ShelfEnv, _ctx: ExecutionContext): Promise<void> {},
} satisfies ExportedHandler<ShelfEnv, ExtractionMessage>;
