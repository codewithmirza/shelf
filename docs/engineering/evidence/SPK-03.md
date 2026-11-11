# SPK-03 · Pay page through ui/open-link

**Status.** Built and checked locally without PayPal credentials. The live sandbox approval waits for S-04 and S-05.

## Proved on 11 Nov 2026 (local Worker, seeded local D1)
- `GET /api/pay/{order}?t=` answers lines, shipping and total from the stored cart; a bad link answers 404 `not_found`.
- `POST /api/pay/{order}/capture?t=bad` answers 404 before any PayPal call.
- The Pay page renders at 900 px and 390 px (screenshots taken in the session). The PayPal sandbox SDK v6 script loads and `createInstance({ clientId })` resolves.
- Server paths are covered by `tests/integration/checkout.test.ts` with a PayPal fake that keeps one result per request ID.

## Notes
- SDK v6 accepts `clientId` directly (developer.paypal.com/sdk/js/set-up). A client token is not needed for one-time PayPal payments.
- If PayPal uses a full-page redirect, it returns to `/pay/{order}/done?token={paypal order id}`. That page captures only when the token matches the order's PayPal ID.

## To do with sandbox credentials
1. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `TOKEN_SECRET` (32+ characters) on the Worker.
2. In Claude: search, add to cart, Pay. Approve with the sandbox buyer. Record the time from approval to "Paid" in the Pay page and in the Storefront (TC-PAY-08 needs T-12 for the Storefront poll).
