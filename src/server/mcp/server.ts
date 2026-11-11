import { McpServer } from "@modelcontextprotocol/server";
import type { ShelfEnv } from "@/env";

// Builds one MCP server per request, so no tool keeps state between calls (ADR-002).
export function createShelfServer(_env: ShelfEnv): McpServer {
  const server = new McpServer(
    { name: "shelf", title: "Shelf", version: "0.1.0" },
    {
      instructions:
        "Shelf lets the user browse small independent stores and pay with PayPal. Show results with the Storefront. Never claim an order is paid unless get_order_status says Captured.",
    },
  );
  return server;
}
