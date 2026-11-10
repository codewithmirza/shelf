# ADR-010 · The Try page hosts the Storefront itself, with Gemini as the chat model

**Status.** Proposed, 10 Nov 2026.

**In one line.** `/try` is a small MCP Apps host: a chat box, Gemini 3.8 Flash with function calling over the Shelf tools, and an iframe that renders the same Storefront HTML.

## Context
- Judges may not add a connector (PR-JDG-01). The rules allow judging from the video and text alone, so the Try page must work in one click.
- The `ext-apps` package includes a host-side bridge for embedding views.

## Decision
1. `/api/try/chat` sends the conversation and the Shelf tool list to Gemini with function calling. It runs each tool call against the same MCP server in process, and returns the text and the last tool result.
2. The page renders the Storefront in a sandboxed iframe and forwards tool results and the view's `tools/call` and `ui/open-link` requests.
3. Limit: 20 messages per visitor per hour.
4. Fallback: if the chat model fails, the page shows a search box that calls `search_products` directly.

## Consequences
- Gemini is visible as a shopping agent in the demo, which strengthens "PayPal + AI".
