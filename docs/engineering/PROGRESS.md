# Progress

> **What this is.** The live state of the build: which task is done, which is in progress, what is blocked and what to do next. Every agent updates it after each step, then commits and pushes.
>
> **Why it comes here.** Work can stop at any moment (a usage limit, a closed laptop). The next agent reads this file first and resumes without asking.
>
> **Shelf example.** "T-08 done: domain rules, 41 tests pass. Next: T-02." The next agent starts T-02.
>
> **What it produces.** The task board, the blockers, the log and the resume steps.

## How to resume

1. Read `AGENTS.md`, then this file.
2. Take the first task in "Next" whose `depends_on` (in `tasks.yaml`) are done.
3. After each step that compiles and passes tests: update this file, commit with `T-nn: <verb> <object>`, push.

## Board

| Task | Title | State | Evidence |
| --- | --- | --- | --- |
| T-01 | Scaffold the repository and the one-Worker entry | Done (deploy waits for S-02) | `evidence/SPK-01.md` |
| T-02 | D1 migration, Drizzle schema, seed loader | Done (remote apply waits for S-02) | `pnpm db:check`: schema match, 14 tables; seed applied to local D1 |
| T-03 | PayPal REST client | Done (unit) | 11 unit tests: same PayPal-Request-Id on retry, no 4xx retry, timeout mapped, shapes parsed. Live TC-PAY-01 waits for S-04 |
| T-04 | Vertex client and extraction schema | Done (offline) | TC-AI-01 with a hand-written fixture answer; retry once on schema break. Live SPK-04 waits for S-03 (`evidence/SPK-04.md`) |
| T-05 | MCP server and Storefront resource | Done (local) | Local Worker answers from D1; TC-MCP-01 in CI. Host screenshots wait for S-02, S-08 (`evidence/SPK-02.md`) |
| T-08 | Domain rules | Done | Every move of the 4 machines checked; TC-PAY-02, TC-PAY-06, TC-CART-04 |
| T-09 | search_products, show_product, update_cart | Done | TC-MCP-01, TC-MCP-03, TC-CART-02; every cart state planned (CQ-34); checked on the local Worker with seeded D1 |
| T-10 | start_checkout, Pay page, capture, signed tokens | Done (local) | TC-PAY-01 (unit), TC-PAY-03, TC-SEC-02; Pay page rendered locally (`evidence/SPK-03.md`). Live sandbox pay waits for S-04, S-05. T-06 spike folded in |
| T-11 | Webhooks and the reconciler | Done | TC-PAY-04, TC-PAY-09 on fakes and on real SQLite with the migration (tests/support/d1.ts). Live webhook waits for S-07 |
| T-12 | get_order_status and request_refund | Done | TC-MCP-04, TC-MCP-05, TC-SEC-02 over MCP on real SQLite; INV-06 held by the unique index |
| T-13 | Storefront views from the design system | Done | Five views + error, built to Figma S1 to S12; explicit state machine (tests/unit/storefront_machine.test.ts); checked in a host bridge: search, product, cart, Pay; order views and the Paid moment with polling in a fixture host (out of repo). 483 KB single file |
| T-14 | MCP host allow list and rate limit | Done | TC-MCP-06 on real SQLite: 61st call per minute per address gets 429; wrong host and foreign Origin refused; addresses stored only as HMAC |
| T-15 | Seller sign-in and store creation | Done (server) | TC-SEL-01, TC-SEL-02 on real SQLite: state check, both userinfo schemas, 7-day __Host- cookie, one seller per PayPal account, link rules and suggestions. Live sign-in waits for S-06 |
| T-16 | Seller app screens | Done | A1 to A13 built; walked locally in a browser at 390 px: name store, empty products, upload, reading bar, failed read, Fill in yourself, price guard, publish, orders empty, store key shown once |
| T-21 | Cart API v1 | Done (local) | TC-CART-02, -03, -05 and TC-CART-01 against the PayPal fake on real SQLite; scripts/cart_agent.mjs for the live run; ADR-007 amended |
| T-22 | Try page | In progress | Search-box host done and checked locally; Gemini chat waits for S-03 |
| T-24 | Store page and landing page | Next | — |

Tasks not listed are not started. States: Next, In progress, Done, Blocked (with the blocker ID).

## Blockers

| ID | Blocks | What is missing | Who |
| --- | --- | --- | --- |
| S-02 | Deploy of T-01, live D1, R2, Queues | Cloudflare Workers Paid plan, resources, `wrangler login` | Founder |
| S-03 | Live run of SPK-04 | GCP service account, AI Gateway with Vertex provider | Founder |
| S-04, S-05 | Live run of SPK-03, SPK-05, contract tests | PayPal sandbox app and accounts | Founder |
| S-06 | SPK-06 | Log in with PayPal on the sandbox app | Founder |
| S-08 | SPK-02 in hosts | Connector in Claude, developer mode in ChatGPT | Founder |

Code is written and tested locally while these are open. Live checks run when the founder finishes each setup step.

## Log

| When (IST) | Who | What |
| --- | --- | --- |
| 11 Nov 11:48 | Claude | T-21: Cart API v1 routes behind verifyCartCaller (store key hash), carts bound to their key, checkout through startCheckout, agent script. |
| 11 Nov 11:46 | Claude | T-16 to T-19 UI: Seller app screens, two-tap refund confirm, tracking sheet, store keys; /api/health reports D1, PayPal token, secrets set (no values). |
| 11 Nov 11:36 | Claude | T-07/T-15: Log in with PayPal, sessions, store creation. T-16 to T-19 server: photo upload to R2 and the queue, extraction consumer, edit/publish with INV-03 and Suggested marks, seller orders, tracking, refund approve (two phases, refund:{id}) and decline. Change: /photos/{key} serves published products only instead of a signed URL. |
| 11 Nov 11:29 | Claude | T-14: /mcp guard: own host only, no cross-site browser calls, 60 per minute per address in D1 (keyed hash, swept by the cron). |
| 11 Nov 11:28 | Claude | T-22 started with T-13. |
| 11 Nov 11:28 | Claude | T-13: Storefront views (results, product, cart, checkout with open-link and 3 s polling, order, refund ask), Paid moment, host theme. T-22 part: Try page hosts the Storefront through AppBridge with the search box (ADR-010); Gemini chat waits for S-03. |
| 11 Nov 11:18 | Claude | T-12: order status read model (no email, address or PayPal ids), buyer timeline text, refund request that returns the first pending one. |
| 11 Nov 11:17 | Claude | T-11: verified webhooks apply PayPal's truth through one syncFromPayPal shared with the 5-minute reconciler (CQ-31); approved-but-uncaptured orders are captured; unpaid orders cancel after 3 h; idle carts expire. D1 adapters now run their real SQL in CI. D1 shelf and R2 shelf-photos created; database_id set. |
| 11 Nov 11:40 | Claude | T-10: start_checkout in 3 phases (CQ-28), guarded capture batch, HMAC pay and order tokens, Pay page with an explicit state machine, PayPal redirect fallback. Added `build:worker` (OpenNext calls `build`, so `build` stays `next build`). New secret: `TOKEN_SECRET`. |
| 11 Nov 12:40 | Claude | T-09: show_product and update_cart over a CartRepo port (D1 + optimistic version); error text table checked against api/error-codes.yaml |
| 11 Nov 12:20 | Claude | T-05: Storefront resource, `search_products` over a Catalog port (D1), hello Storefront calling a tool, TC-MCP-01 |
| 11 Nov 12:10 | Claude | T-04: Vertex client and extraction schema in `src/server/model/`; contract tests run in `pnpm check` |
| 11 Nov 12:05 | Claude | T-03: PayPal client in `src/server/paypal/` (http, orders, refunds, webhooks) with 11 unit tests |
| 11 Nov 08:05 | Claude | T-08: explicit state machines (SM-PRD, SM-CRT, SM-ORD, SM-RFD), branded money and IDs, server-side cart pricing, refund and publish rules, idempotency keys. 22 tests pass; typecheck clean. |
| 11 Nov 07:35 | Claude | T-02: Drizzle schema matches the migration (new `pnpm db:check`). Fixed nullable TEXT primary keys in 0001 before any apply. Seed: 2 demo stores, 6 products, 7 variants. |
| 11 Nov 07:10 | Claude | T-01: scaffold, one Worker serves Next.js and /mcp; SPK-01 passes locally (972 KiB gzip). |
| 11 Nov 06:30 | Claude | Added backend and API code quality rules CQ-21 to CQ-34 (Brandur Leach, Alexis King). Updated version pins (ADR-011). Created this file. |

## The principle to remember

If it is not in this file and not pushed, it did not happen.
