# Gate 6 · Quality contract

> **What this is.** How we know Shelf works: the spikes that remove the big risks first, the test cases, the checks in CI, the deploy and rollback steps, and the demo script.
>
> **Why it comes here.** Gates 1 to 5 say what to build. This gate says what proof each part needs. Gate 7 tasks are done only when their tests pass.
>
> **Shelf example.** SPK-03 proves that the Storefront can open the Pay page from inside Claude. If it fails, ADR-005's text-link fallback becomes the plan before any UI polish starts.
>
> **What it produces.** SPK-01 to SPK-07, the test catalogue, the CI checks, the deploy and rollback steps, and the demo script.

## Spikes

> **What this is.** Short, throwaway experiments that answer one risky question each, with a pass rule and a fallback.
>
> **Why it comes here.** A spike that fails on day one costs hours. The same failure found on day two costs the entry.
>
> **Shelf example.** SPK-04 sends 5 real product photos to `gemini-3.8-flash` through AI Gateway and checks that each answer matches the extraction schema in under 15 s.
>
> **What it produces.** The spike table. Run SPK-01 to SPK-04 before any feature task.

| ID | Question | Pass | Fallback | Risk |
| --- | --- | --- | --- | --- |
| SPK-01 | Do Next.js (OpenNext) and the MCP handler, queue and cron run in one Worker? | `wrangler deploy` succeeds under 10 MiB gzip; MCP Inspector `initialize` works on `/mcp`; a Next.js page renders. | Two Workers sharing D1 and R2 (ADR-001). | Storefront does not render |
| SPK-02 | Does one Storefront resource render in Claude and in ChatGPT, and can it call a tool? | The same `ui://` resource renders in both; a button's `tools/call` round-trips. | Claude first; ChatGPT only if it passes. | Storefront does not render |
| SPK-03 | Can the Storefront open the Pay page and see the capture? | `ui/open-link` opens `/pay/{order}`; sandbox approval; capture; the Storefront shows Captured within 10 s by polling. | Text link in the tool result; the Try page carries the demo (ADR-005). | PayPal approval blocked in the host frame |
| SPK-04 | Does Vertex `gemini-3.8-flash` answer from a Worker through AI Gateway? | 5 photos return schema-valid JSON in under 15 s each. Record the auth path. | Service-account JWT with WebCrypto (ADR-006). | Vertex auth fails on Workers |
| SPK-05 | Do webhook verification and idempotency work in the sandbox? | A simulated `PAYMENT.CAPTURE.COMPLETED` verifies, and a replay changes nothing. | Capture answer plus the reconciler. | — |
| SPK-06 | Does Log in with PayPal work in the sandbox, and can its email be the payee? | Sign-in returns account ID and email; an order with that payee captures into that sandbox account. | Demo seller sign-in for the two seeded stores, labelled "Demo seller" (ADR-008). | — |
| SPK-07 | Does `ext-apps` register tools and the resource on an SDK v2 `McpServer`? | `tools/list` shows both `_meta` keys; `resources/read` returns the HTML with the right MIME. | Set `_meta` and the resource by hand (ADR-002). | — |

Record each spike result in `docs/engineering/evidence/SPK-nn.md`: date, what ran, the result, and a screenshot or log without secrets.

## Test catalogue

> **What this is.** Every test case, the requirement it proves, its kind and where it runs.
>
> **Why it comes here.** A task names its test IDs. The test name in code holds the ID, so a search finds it.
>
> **Shelf example.** `it("TC-PAY-02 ignores client prices", …)` sends a cart with `"price": 1` and expects the stored total.
>
> **What it produces.** The test table.

Kinds: Unit (pure domain code), Integration (Worker runtime with local D1 via `@cloudflare/vitest-pool-workers`), Contract (real PayPal sandbox or recorded sandbox answers), E2E (Playwright against the deployed sandbox Worker), Manual (on the video or a checklist).

| ID | Proves | Kind | What it does |
| --- | --- | --- | --- |
| TC-PAY-01 | SYS-PAY-02 | Contract | `start_checkout` creates one sandbox order: CAPTURE, USD, payee = seller, server total. |
| TC-PAY-02 | SYS-PAY-01, INV-01 | Unit | Cart input with fake prices and totals; output uses stored prices only. |
| TC-PAY-03 | SYS-PAY-03, INV-04 | Integration | Two captures of one order; one capture ID; same `PayPal-Request-Id`. |
| TC-PAY-04 | SYS-PAY-04, INV-08, INV-09 | Integration | A signed webhook applies once; a replay and a bad signature change nothing; one Event per change. |
| TC-PAY-05 | SYS-PAY-06 | Integration | Approve calls refund once with the request ID as `PayPal-Request-Id`. |
| TC-PAY-06 | SYS-PAY-07, INV-07 | Unit | Refund amount never exceeds captured minus refunded. |
| TC-PAY-07 | SYS-PAY-08 | Contract | Tracking reaches PayPal; the order is Shipped. |
| TC-PAY-08 | SYS-PAY-05, SYS-MCP-06 | E2E | Paid shows in the Storefront within 10 s after capture (10 runs, p95). |
| TC-PAY-09 | SYS-PAY-09 | Integration | The reconciler reads PayPal for an Approved order older than 10 minutes and sets the true state. |
| TC-MCP-01 | SYS-MCP-01, SYS-MCP-03, SYS-MCP-04, SYS-MCP-05, SYS-MCP-07 | Integration | A stateless Streamable HTTP `initialize`, then `tools/list` and `resources/read` match Gate 5: MIME, both `_meta` keys, annotations, no `connectDomains`. |
| TC-MCP-02 | AC-BUY-01-01, AC-SEL-03-02 | Integration | Search returns only published products under the maximum price, at most 6. |
| TC-MCP-03 | SYS-MCP-02 | Integration | Every tool's text content holds the same facts as `structuredContent`. |
| TC-MCP-04 | AC-BUY-04-01 | Integration | `get_order_status` returns state, timeline and tracking. |
| TC-MCP-05 | AC-BUY-05-01 to 03, INV-06 | Integration | A second `request_refund` returns the first request. |
| TC-MCP-06 | SYS-MCP-08 | Integration | A wrong host is refused; the 301st call in a minute from one address gets 429. (Changed from 61 on 11 Nov 2026: hosts call from shared addresses and checkout polls 20 times a minute.) |
| TC-CART-01 | SYS-CART-01, SYS-CART-04 | Contract | The agent script creates, replaces, reads and checks out a cart against a sandbox approval. |
| TC-CART-02 | SYS-CART-02 | Integration | PUT replaces; old lines are gone. |
| TC-CART-03 | SYS-CART-03 | Integration | Out of stock gives 200 with an issue; unknown cart 404; bad body 400; not approved 422. |
| TC-CART-04 | INV-02 | Unit | A variant of another store gives `OTHER_STORE`. |
| TC-CART-05 | SYS-CART-05 | Integration | No key and a revoked key give 401. |
| TC-AI-01 | SYS-AI-01, SYS-AI-03, SYS-AI-04 | Contract | A recorded Vertex answer for a mug photo makes a Draft with `ai_fields`; an answer that breaks the schema is retried once, then the photo is Failed. One live run per day. |
| TC-AI-02 | SYS-AI-02, INV-03 | Integration | Publish with an unconfirmed price gives 409. |
| TC-AI-03 | SYS-AI-05 | Contract | A photo with injected text yields no price and no publish. |
| TC-SEL-01 | SYS-SEL-01, NFR-SEC-04 | Integration | OAuth return with a wrong `state` is refused; a good one sets a seller and a cookie with the right flags. |
| TC-SEL-02 | AC-SEL-01-03 | Unit | Slug rules. |
| TC-SEC-01 | SYS-SEL-02, INV-10 | Integration | Seller B gets 404 on each of seller A's routes. |
| TC-SEC-02 | NFR-SEC-02, THR-06, THR-08 | Integration | Expired and tampered pay tokens and order tokens are refused. |
| TC-SEC-03 | INV-05, THR-05 | Integration | No MCP tool and no Cart API route can set a request to Approved. |
| TC-SEC-04 | NFR-SEC-01, NFR-SEC-03, SYS-PAY-10 | Inspection (script) | `scripts/check_secrets.sh` finds no secret pattern in the repository or the Storefront build; logs redact emails; `PAYPAL_BASE` is the sandbox host in every environment. |
| TC-PERF-01 | NFR-PERF-01, NFR-PERF-02 | Manual (Analysis) | 50 tool calls; p95 under 1.5 s excluding PayPal and model. Lighthouse on a mid-range phone profile: Seller app interactive under 2.5 s. |
| TC-PERF-02 | SYS-SEL-04 | Manual (Analysis) | 10 uploads; p95 photo to draft under 20 s. |
| TC-A11Y-01 | NFR-A11Y-01, NFR-A11Y-02 | Manual | axe check on each page; keyboard path; reduced motion. |
| TC-E2E-01 | FL-JDG-01, NFR-OPS-01 | E2E | Against the one deployed Worker: Try page search, add, pay with the sandbox buyer, Paid, timeline. |
| TC-HOST-01 | SYS-MCP-09 | Manual | The buy path in Claude (custom connector) and ChatGPT (developer mode), screen-recorded for the video. |
| TC-E2E-02 | FL-SEL-02 to 05 | E2E | Seller: upload, publish, see the order, add tracking, approve a refund. |

## CI checks

> **What this is.** What runs on every pull request.
>
> **Why it comes here.** Agents work unattended. CI is the reviewer that never sleeps.
>
> **Shelf example.** A task that adds a route but no test with its TC ID fails `check_traceability`.
>
> **What it produces.** The check list.

| Check | Command | Blocks merge |
| --- | --- | --- |
| Types | `pnpm typecheck` | Yes |
| Lint | `pnpm lint` | Yes |
| Unit and integration | `pnpm test` | Yes |
| Build | `pnpm build` (Storefront, then OpenNext) and a bundle size check under 10 MiB gzip | Yes |
| Schema match | `pnpm drizzle-kit check` | Yes |
| Traceability | `node scripts/check_traceability.mjs`: every TC ID in this file appears in a test name, or is marked Manual | Yes, from 12 Nov 14:00 IST |
| Secrets | `scripts/check_secrets.sh` | Yes |
| Code quality | ESLint rules: `@typescript-eslint/switch-exhaustiveness-check` (CQ-05), `react/no-danger` (CQ-19), a `no-restricted-syntax` ban on `transition: all` and on assigning `.state =` outside `src/server/domain/` (CQ-02, CQ-13) | Yes |

## Deploy and rollback

> **What this is.** How a change reaches the judges' URL and how to undo it.
>
> **Why it comes here.** A bad deploy on 12 Nov evening must be undone in one command.
>
> **Shelf example.** The video recording uses Worker version 41. If version 42 breaks the Try page, `wrangler rollback` returns to 41.
>
> **What it produces.** D-01 to D-05.

| ID | Step |
| --- | --- |
| D-01 | Apply D1 migrations: `wrangler d1 migrations apply shelf --remote`. |
| D-02 | Deploy: `pnpm deploy` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`). |
| D-03 | Smoke: `scripts/smoke.sh` calls `/mcp` initialize, `tools/list`, `/try`, and one `search_products`. |
| D-04 | Rollback: `wrangler rollback <version-id>`. Migrations only add; they never drop in R1. |
| D-05 | Freeze: no deploy after 12 Nov 20:00 IST except a rollback. Record the version ID used in the video in the README. |

## Demo script

> **What this is.** The 3-minute video, shot by shot, with the proof each shot gives.
>
> **Why it comes here.** Judges may judge from the video alone. The video is a test of the whole system.
>
> **Shelf example.** Shot 4 shows the same Storefront in Claude and ChatGPT side by side: differentiator D1.
>
> **What it produces.** The shot list (target 2:45).

| Time | Shot | Proves |
| --- | --- | --- |
| 0:00 | The problem in one line, with PayPal's 23% figure on screen and its source. | P1 |
| 0:15 | "Shelf is the PayPal checkout that lives inside the chat." | Concept |
| 0:25 | Maya uploads 3 photos on a phone. Drafts appear. She confirms a price and publishes. | FL-SEL-02, FL-SEL-03 |
| 0:55 | In Claude: "a blue mug under $40". The Storefront shows cards; Ben picks Large; cart; Pay with PayPal; sandbox approval; the card turns Paid. | FL-BUY-01 to 03, D2 |
| 1:40 | The same in ChatGPT, short, side by side. | D1 |
| 1:55 | Maya's phone shows the order; she adds tracking; Ben asks for a refund; Maya approves in two taps. | FL-SEL-04, FL-SEL-05, D3 |
| 2:20 | Under the hood: one diagram; PayPal Orders v2, webhooks, refunds, tracking, Cart API v1; Gemini 3.8 Flash on Vertex; Cloudflare Workers. | Tech |
| 2:35 | Try it: the Try page link and the repository link. | Judges |

## The principle to remember

Remove the biggest risk first, give every requirement a named test, and treat the video as the final test.
