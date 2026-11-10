# ADR-004 · PayPal through REST with `fetch` on the server, JS SDK v6 on the Pay page

**Status.** Proposed, 10 Nov 2026.

**In one line.** `src/server/paypal/` is a small typed REST client for OAuth, Orders v2, Payments, Webhooks and Identity. The Pay page loads PayPal JS SDK v6.

## Context
- The PayPal Server SDK repository says it "currently contains only 5 of PayPal's API endpoints". Its Workers support is not verified.
- PayPal Agent Toolkit (`@paypal/agent-toolkit`) and the PayPal MCP server expose tools for a model. Shelf must not let a model capture or refund (INV-05).
- JS SDK v6: `paypal.createInstance`, `createPayPalOneTimePaymentSession`, `session.start({ presentationMode }, createOrderPromise)`.

## Options
| | REST with fetch (chosen) | PayPal Server SDK | Agent Toolkit as the payment layer |
| --- | --- | --- | --- |
| Coverage | All endpoints we need | 5 endpoints | Tools shaped for a model |
| Workers | Native `fetch` | Unverified | Unverified |
| Control of who moves money | Full | Full | The model calls tools |

## Decision
1. Endpoints used: `POST /v1/oauth2/token`; `POST /v2/checkout/orders`; `GET /v2/checkout/orders/{id}`; `POST /v2/checkout/orders/{id}/capture`; `POST /v2/checkout/orders/{id}/track`; `POST /v2/payments/captures/{id}/refund`; `POST /v1/notifications/verify-webhook-signature`; `POST /v1/catalogs/products` (Should); Log in with PayPal endpoints (ADR-008).
2. Cache the access token in memory per isolate until 60 s before expiry.
3. Every create, capture and refund sends `PayPal-Request-Id`.
4. Every call has a 10 s timeout and maps PayPal errors to Gate 5 error codes.
5. The Pay page uses JS SDK v6 from `https://www.sandbox.paypal.com/web-sdk/v6/core`.
6. The Agent Toolkit is used only in an optional seller tool "ask about my sales" (read-only tools), if time allows.

## Consequences
- We write about 200 lines of client code. Each path is tested against the sandbox in SPK-03 and the contract tests.
