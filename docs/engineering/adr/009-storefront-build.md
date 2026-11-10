# ADR-009 · The Storefront is one HTML file built by Vite and served as an MCP App resource

**Status.** Proposed, 10 Nov 2026.

**In one line.** `storefront/` is a small React app. Vite and `vite-plugin-singlefile` build it into one HTML file. The MCP server serves it as `ui://shelf/storefront.html` with MIME `text/html;profile=mcp-app`.

## Context
- MCP Apps (SEP-1865, final, extension `io.modelcontextprotocol/ui`): a tool links a `ui://` resource with `_meta.ui.resourceUri`. The flat key `ui/resourceUri` is deprecated.
- OpenAI: prefer `_meta.ui.resourceUri`; `openai/outputTemplate` is a compatibility alias. One public issue reports an app that failed to render in ChatGPT without the alias.
- The view talks to the host with `tools/call`, `ui/open-link` and `ui/message`, and gets tool results from the host.

## Decision
1. Each UI tool sets `_meta.ui.resourceUri` and `_meta["openai/outputTemplate"]` to `ui://shelf/storefront.html`.
2. The resource declares `_meta.ui.csp.resourceDomains: [PUBLIC_ORIGIN]` for photos and no `connectDomains`.
3. The Storefront uses the `App` class of `@modelcontextprotocol/ext-apps` to receive tool results and call tools.
4. The build writes `storefront/dist/storefront.html`. A build step copies it into `src/server/mcp/storefront.generated.ts` as a string. That file is generated; never edit it by hand.
5. The Storefront has one view per tool result kind: results, product, cart, checkout, order.

## Consequences
- The Storefront bundle must stay small (target under 200 KB gzip) because it is inlined into the Worker.
