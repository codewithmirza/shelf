# SPK-02 / SPK-07 · Storefront as an MCP App in Claude and ChatGPT

**Status.** Proved locally. Rendering inside Claude and ChatGPT waits for S-02 (deploy) and S-08 (connectors).

## Proved on 11 Nov 2026 (local Worker, `wrangler dev`, seeded local D1)
- `POST /mcp` `tools/call search_products {"query":"mug","max_price":40}` answers one text block and `structuredContent.view = "results"` with `prd_demo_mug` at `24.00` USD.
- `resources/read ui://shelf/storefront.html` answers MIME `text/html;profile=mcp-app` and `_meta.ui.csp = {resourceDomains:[PUBLIC_ORIGIN]}`, no `connectDomains`.
- `tests/integration/mcp_surface.test.ts` (TC-MCP-01, TC-MCP-03 for search) drives the same server over stateless Streamable HTTP in CI.

## Storefront size
`storefront/dist/index.html` is 455 KB (129 KB gzip) for the hello view: React plus the ext-apps `App` with its schemas. T-13 should check this against hosts' limits.

## To do (screenshots)
1. Claude: add the deployed `/mcp` as a custom connector, ask "find me a mug under $40", screenshot the Storefront, tap "Search mugs", screenshot the answer.
2. ChatGPT developer mode: the same two screenshots.
