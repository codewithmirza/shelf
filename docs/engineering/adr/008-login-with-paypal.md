# ADR-008 · Sellers sign in with Log in with PayPal; the PayPal account is the payee

**Status.** Proposed, 10 Nov 2026.

**In one line.** The Seller app uses Log in with PayPal (OAuth 2.0 authorization code). Shelf stores the PayPal account ID and email from the userinfo answer, and sets that email as the order payee.

## Context
- A seller must receive money in their own PayPal account.
- Orders v2 accepts `purchase_units[].payee.email_address` or `merchant_id`. Partner onboarding and platform fees need PayPal Platform approval in production.
- Email magic links need an email provider; passkeys need more UI work.

## Options
| | Log in with PayPal (chosen) | Email magic link | Passkey |
| --- | --- | --- | --- |
| Proves the payee account | Yes | No | No |
| New vendor | No | Yes | No |
| PayPal centrality | Higher | — | — |

## Decision
1. Enable Log in with PayPal on the sandbox app, scopes `openid email https://uri.paypal.com/services/paypalattributes`, return URL `{PUBLIC_ORIGIN}/api/auth/paypal/return`.
2. Use `state` and PKCE where supported. Exchange the code at `POST /v1/oauth2/token` (`grant_type=authorization_code`), then read the user info with `GET /v1/identity/oauth2/userinfo?schema=paypalv1.1` (the older path is `/v1/identity/openidconnect/userinfo?schema=openid`; SPK-06 confirms which one the sandbox answers).
3. Create a session row and an HttpOnly, Secure, SameSite=Lax cookie for 7 days.
4. If SPK-06 fails, fix Log in with PayPal; there is no demo-seller fallback (no mock data, founders' decision of 11 Nov 2026).

## Consequences
- In production, payee routing beyond the API caller's own account may need PayPal Platform approval.
