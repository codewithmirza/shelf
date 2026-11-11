# ADR-007 · Implement PayPal's Cart API v1 contract without a Store Sync dependency

**Status.** Proposed, 10 Nov 2026.

**In one line.** Each store answers the Cart API v1 paths under `/api/stores/{slug}/`. Shelf checks its own store keys now and can switch to PayPal's JWT check later.

## Context
- Store Sync has limited availability, needs an access request, and accepts only US buyers, USD and physical goods.
- The Cart API: `POST /merchant-cart`, `PUT /merchant-cart/{id}` (full replacement), `POST /merchant-cart/{id}/checkout`. Business problems answer 200 with `validation_issues`; 400, 404 and 422 for hard cases. Requests carry `Authorization: Bearer <paypal-jwt-token>`.

## Decision
1. Implement the four paths (including `GET`) with the shapes in `api/openapi.yaml`.
2. `verifyCartCaller(request, store)` is one function. R1 checks a store key hash. Later it verifies PayPal's JWT.
3. Map cart create to `POST /v2/checkout/orders` and cart replace to an order update, per PayPal's Orders v2 pattern; capture at checkout.
4. Test with a contract script that plays an agent. Check shapes against PayPal's published Postman collection where available.
5. The README says "compatible with the Cart API v1 contract" and never "Store Sync enabled".

## Amendment, 11 Nov 2026 (DoD-06)
Point 3 is narrowed for R1. `POST` and `PUT` price and validate the cart only. The first `POST /checkout` with an empty body creates the PayPal order through the same `startCheckout` as the MCP tool, and answers `paypal_order_id` and `approve_url` (the Shelf Pay page). `POST /checkout` with `paypal_order_id` captures, or answers 422 `checkout.not_approved`. A cart that is checking out refuses `PUT` with 422. Why: one PayPal order per cart version would leave orphan orders, and one checkout path is tested once. An agent sees only the carts its own key made. `scripts/cart_agent.mjs` plays the agent against a live URL.

## Consequences
- If Shelf later gets Store Sync access, only `verifyCartCaller` and the store registration change.
