// A tiny MCP client for the Try page: stateless Streamable HTTP to our own /mcp, as Claude and ChatGPT call it.
let nextId = 1;

export interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export async function mcp<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (res.status === 429) throw new Error("Too many tries. Wait a minute.");
  const text = await res.text();
  const data = text.trimStart().startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? "";
  const msg = JSON.parse(data) as { result?: T; error?: { message: string } };
  if (msg.error || msg.result === undefined) throw new Error(msg.error?.message ?? "Shelf isn't answering.");
  return msg.result;
}

export const callTool = (name: string, args: Record<string, unknown>) => mcp<ToolResult>("tools/call", { name, arguments: args });

export async function storefrontHtml(): Promise<string> {
  const r = await mcp<{ contents: { text?: string }[] }>("resources/read", { uri: "ui://shelf/storefront.html" });
  return r.contents[0]?.text ?? "";
}

// "a blue mug under $40" -> { query: "a blue mug", max_price: 40 }. Used by the search box (ADR-010 fallback).
export function parseSearch(input: string): { query: string; max_price?: number } {
  const m = input.match(/\b(?:under|below|less than|max|<)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  const query = (m ? input.replace(m[0], "") : input).replace(/\s+/g, " ").trim() || input.trim();
  return m ? { query, max_price: Number(m[1]) } : { query };
}
