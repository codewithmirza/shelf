# ADR-012 · Buyers and sellers use Shelf from WhatsApp

**Status.** Accepted, 12 Nov 2026.

**In one line.** A Gemini agent on WhatsApp is one more client of the Shelf MCP tools: buyers search, pick, and get a PayPal Pay link; sellers send photos, set prices and publish. The web app and other AI agents keep working the same way.

## Context
- Most buyers and sellers in India use WhatsApp every day. Many will never add an MCP connector to an AI assistant.
- Shelf's rules (server prices, idempotent checkout, Paid only from PayPal) live in the MCP tools and the domain code. A second copy of those rules for WhatsApp would drift.
- The Workers Free plan gives one queue and short request time after a response.

## Decision
1. **WhatsApp Cloud API.** `/api/whatsapp/webhook` answers Meta's GET subscription check with the verify token. A POST is accepted only with a valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret), then each message goes on the queue and the webhook answers 200 at once.
2. **The queue runs the agent.** The `extraction` queue carries photo jobs, inbound WhatsApp messages (`wa_in`) and Paid checks (`wa_watch`). WhatsApp jobs are acknowledged even when they fail, so nobody gets a reply twice. `wa_seen` drops Meta's repeat deliveries.
3. **Same tools.** The buyer agent calls `search_products`, `show_product`, `update_cart`, `start_checkout`, `get_order_status` and `request_refund` through the same MCP handler as `/mcp`, in process.
4. **The model holds no secrets.** Shelf keeps the cart id and order tokens in `wa_chats` and `wa_orders`. Shelf sends product photos and the exact Pay link itself; the model only refers to them.
5. **Paid comes from PayPal.** After checkout, a `wa_watch` job checks the order every 20 seconds for about 33 minutes (the Pay link lasts 30). When the order is captured, the buyer gets "Paid" and the linked seller gets "New order", each once.
6. **Sellers link from the Seller app.** Store → Connect WhatsApp makes a 15-minute signed code (`wa_link`, subject = seller id) and opens WhatsApp with it. The number that sends it is linked to that seller.
7. **Seller tools.** Photos sent on WhatsApp go through the normal upload and Gemini extraction; Shelf messages the draft back. The seller sets prices and publishes in chat. The model passes on only prices the seller stated. Refunds and tracking stay in the Seller app (two taps).
8. **Model.** Gemini 3.8 Flash on Vertex AI with function calling (ADR-006). Gemini's turn goes back verbatim within one message, so thought signatures are kept; across messages only text turns are kept (16 at most).

## Consequences
- A buyer can go from "laddu under $20" to a PayPal sandbox payment without leaving WhatsApp, except for the PayPal approval page.
- Free-form WhatsApp messages reach a person only within 24 hours of their last message. "Paid" and "Draft ready" fall inside that window. A seller who has not written for a day needs an approved template for "New order"; not built yet.
- The Meta test number allows five verified recipient numbers. A real launch needs a verified business number.
