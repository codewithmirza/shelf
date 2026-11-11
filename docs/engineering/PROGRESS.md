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
| 11 Nov 12:40 | Claude | T-09: show_product and update_cart over a CartRepo port (D1 + optimistic version); error text table checked against api/error-codes.yaml |
| 11 Nov 12:20 | Claude | T-05: Storefront resource, `search_products` over a Catalog port (D1), hello Storefront calling a tool, TC-MCP-01 |
| 11 Nov 12:10 | Claude | T-04: Vertex client and extraction schema in `src/server/model/`; contract tests run in `pnpm check` |
| 11 Nov 12:05 | Claude | T-03: PayPal client in `src/server/paypal/` (http, orders, refunds, webhooks) with 11 unit tests |
| T-01 | Scaffold the repository and the one-Worker entry | Done (deploy waits for S-02) | `evidence/SPK-01.md` |
| T-02 | D1 migration, Drizzle schema, seed loader | Done (remote apply waits for S-02) | `pnpm db:check`: schema match, 14 tables; seed applied to local D1 |
| T-04 | Vertex client and extraction schema | Done (offline) | `pnpm check`: 42 tests; TC-AI-01 with a hand-written fixture answer; retry-once on schema break; live SPK-04 waits for S-03 (evidence/SPK-04.md) |
| T-05 | MCP server and Storefront resource | Done (local) | Worker answers `search_products` from local D1; TC-MCP-01 in CI; host screenshots wait for S-02, S-08 (evidence/SPK-02.md). `search_products` pulled forward from T-09 as the one tool |
| T-08 | Domain rules | Done | `pnpm test`: 22 tests; every move of the 4 machines checked; TC-PAY-02, TC-PAY-06, TC-CART-04 |
| T-03 | PayPal REST client (code and unit tests; live sandbox waits for S-04) | Done (unit) | `pnpm check`: 33 tests; same PayPal-Request-Id on retry, no 4xx retry, timeout mapped, shapes parsed. Live TC-PAY-01 waits for S-04 |

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
| 11 Nov 08:05 | Claude | T-08: explicit state machines (SM-PRD, SM-CRT, SM-ORD, SM-RFD), branded money and IDs, server-side cart pricing, refund and publish rules, idempotency keys. 22 tests pass; typecheck clean. |
| 11 Nov 07:35 | Claude | T-02: Drizzle schema matches the migration (new `pnpm db:check`). Fixed nullable TEXT primary keys in 0001 before any apply. Seed: 2 demo stores, 6 products, 7 variants. |
| 11 Nov 07:10 | Claude | T-01: scaffold, one Worker serves Next.js and /mcp; SPK-01 passes locally (972 KiB gzip). |
| 11 Nov 06:30 | Claude | Added backend and API code quality rules CQ-21 to CQ-34 (Brandur Leach, Alexis King). Updated version pins (ADR-011). Created this file. |

## The principle to remember

If it is not in this file and not pushed, it did not happen.
