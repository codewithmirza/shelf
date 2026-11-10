# ADR-002 · Stateless MCP server with `createMcpHandler` and MCP SDK v2

**Status.** Proposed, 10 Nov 2026.

**In one line.** The `agents` package's `createMcpHandler` serves one `McpServer` from `@modelcontextprotocol/server@2.3.1` over Streamable HTTP at `/mcp`, with no session store.

## Context
- Agents SDK v0.20.0 (27 Jul 2026) supports MCP spec 2026-07-28 and SDK v2. `McpAgent` is "deprecated and feature-frozen".
- `createMcpHandler` supports `allowedHostnames` origin checks and works with the Workers OAuth Provider.
- Shelf tools need no per-session state. The cart lives in D1 and its ID travels in tool arguments.

## Options
| | `createMcpHandler` stateless (chosen) | `McpAgent` on a Durable Object | Hand-written JSON-RPC |
| --- | --- | --- | --- |
| Status | Current | Deprecated | No library support |
| State | D1 | Durable Object | D1 |
| Effort | Low | Medium | High |

## Decision
1. Build the server in `src/server/mcp/server.ts` with a factory `createShelfServer(env)`. Register tools with zod schemas and the Storefront resource.
2. `src/worker.ts` calls `createMcpHandler(createShelfServer, { route: "/mcp", allowedHostnames })`.
3. No authentication on `/mcp` in R1. Buyer data is protected by order tokens (THR-06).
4. Pin `@modelcontextprotocol/server` to `2.3.1` exactly.

## Consequences
- If `ext-apps` server helpers do not accept an SDK v2 `McpServer`, set `_meta` and the resource by hand (SPK-02).
- OAuth can be added later through the Workers OAuth Provider with no change to tools.
