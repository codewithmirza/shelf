import { createMcpHandler } from "agents/mcp/server";
import type { ShelfEnv } from "@/env";
import { createShelfServer } from "../mcp/server";
import { mcpDeps } from "../runtime";

export interface ToolAnswer {
  readonly text: string;
  readonly structured: Record<string, unknown> | null;
  readonly isError: boolean;
}

// The WhatsApp agent is one more MCP client of Shelf: it calls the same tools Claude and ChatGPT call, through the
// same handler as /mcp, in this Worker, with no network hop. So pricing, carts and checkout have one code path.
export async function callShelfTool(env: ShelfEnv, ctx: ExecutionContext, name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
  const handler = createMcpHandler(() => createShelfServer(mcpDeps(env)), { route: "/mcp" });
  const req = new Request(`${env.PUBLIC_ORIGIN}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = await handler(req, env, ctx);
  const raw = await res.text();
  const data = raw.trimStart().startsWith("{") ? raw : (raw.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? "");
  let msg: { result?: { content?: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }; error?: { message: string } };
  try { msg = JSON.parse(data); } catch { return { text: "Shelf did not answer.", structured: null, isError: true }; }
  if (!msg.result) return { text: msg.error?.message ?? "Shelf did not answer.", structured: null, isError: true };
  const text = (msg.result.content ?? []).map((c) => c.text ?? "").join(" ").trim();
  return { text, structured: msg.result.structuredContent ?? null, isError: Boolean(msg.result.isError) };
}
