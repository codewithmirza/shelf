# Shelf · System requirements (SyRS)

> **What this is.** What the system shall do, in numbered "shall" statements. Each one traces to a product requirement and names how we verify it. The layout follows ISO/IEC/IEEE 29148 in spirit.
>
> **Why it comes here.** The PRD says what a person gets. This document says what the software must guarantee. Gate 1 acceptance criteria and Gate 6 tests point to these IDs.
>
> **Shelf example.** SYS-PAY-01 says the server computes every amount. So when a buyer edits the price in the browser, the order still charges the real price, and test TC-PAY-02 proves it.
>
> **What it produces.** The system context, the requirements by area, and the verification methods.

Status: written 10 Nov 2026. Sources: `02-PRD.md`, and constraints C-1 to C-6 from the founders' private business requirements, restated below as CON-01 to CON-06.

**Verification methods.** Test (an automated test), Inspection (a person or a check script reads the code or the config), Demo (shown on the recorded video or a live run), Analysis (a calculation or a measurement report).

## System context

> **What this is.** The system boundary: what is inside Shelf and what is outside.
>
> **Why it comes here.** A requirement is about something inside the boundary. Outside systems get interface requirements only.
>
> **Shelf example.** PayPal captures the payment; Shelf only asks PayPal to capture and records the result.
>
> **What it produces.** The context table.

| Inside Shelf | Outside Shelf |
| --- | --- |
| The Shelf Worker: Next.js app (Seller app, Try page, Pay page, store pages), MCP endpoint, Cart API, webhook route, queue consumer, scheduled job | PayPal REST APIs and PayPal JS SDK v6 (sandbox) |
| D1 database, R2 photo bucket, Queue | Vertex AI (`gemini-3.8-flash`) through Cloudflare AI Gateway |
| The Storefront widget (one HTML document) | MCP hosts: Claude and ChatGPT |
| | Other AI agents that call the Cart API |

## Functional requirements: payments

> **What this is.** What the system guarantees about money.
>
> **Why it comes here.** Money errors cost trust and break PayPal rules. These requirements have the most tests.
>
> **Shelf example.** A webhook that arrives twice changes the order once (SYS-PAY-04).
>
> **What it produces.** SYS-PAY-01 to SYS-PAY-10.

| ID | Requirement | Traces to | Verify |
| --- | --- | --- | --- |
| SYS-PAY-01 | The system shall compute every price, shipping amount and total on the server from stored values, and shall ignore any amount sent by a client or an agent. | PR-BUY-03, PR-AGT-01 | Test |
| SYS-PAY-02 | The system shall create each PayPal order with Orders v2, intent CAPTURE, currency USD, and the seller's PayPal account as payee. | PR-BUY-04, PR-SEL-01 | Test |
| SYS-PAY-03 | The system shall send a `PayPal-Request-Id` on every PayPal create, capture and refund call, derived from the cart version or the refund request, so a retry acts once. | PR-BUY-04 | Test |
| SYS-PAY-04 | The system shall verify each PayPal webhook with PayPal's verify-webhook-signature API before it changes any state, and shall record each webhook event ID once. | PR-BUY-04 | Test |
| SYS-PAY-05 | The system shall show the order as Paid in the Storefront within 10 s (p95) after PayPal confirms the capture. | PR-BUY-04 | Demo, Analysis |
| SYS-PAY-06 | The system shall execute a refund only after the seller approves it in the Seller app. No tool and no model can execute a refund. | PR-SEL-09, PR-BUY-06 | Test, Inspection |
| SYS-PAY-07 | The system shall refund through `POST /v2/payments/captures/{capture_id}/refund` and shall not refund more than the captured amount. | PR-SEL-09 | Test |
| SYS-PAY-08 | The system shall send tracking to PayPal for the order when the seller adds it. | PR-SEL-08 | Test |
| SYS-PAY-09 | The system shall check every 5 minutes for orders that are Approved but not Captured for more than 10 minutes, and read their state from PayPal. | PR-BUY-04 | Test |
| SYS-PAY-10 | The system shall use the PayPal sandbox only in R1. | C-2 | Inspection |

## Functional requirements: Storefront and MCP

> **What this is.** What the MCP endpoint and the Storefront widget guarantee.
>
> **Why it comes here.** This is differentiator D1 and D2. It must work in two hosts and degrade to text in others.
>
> **Shelf example.** In a host with no MCP Apps, `search_products` still returns a text list with prices (SYS-MCP-02).
>
> **What it produces.** SYS-MCP-01 to SYS-MCP-09.

| ID | Requirement | Traces to | Verify |
| --- | --- | --- | --- |
| SYS-MCP-01 | The system shall serve MCP over Streamable HTTP at `/mcp`, without a session store. | PR-BUY-01 | Test |
| SYS-MCP-02 | Every tool shall return a text `content` that holds the same facts as its `structuredContent`. | PR-BUY-07 | Test |
| SYS-MCP-03 | The system shall serve the Storefront as one resource `ui://shelf/storefront.html` with MIME type `text/html;profile=mcp-app`. | PR-BUY-01 | Test |
| SYS-MCP-04 | Each tool with a UI shall declare `_meta.ui.resourceUri` and the same URI in `_meta["openai/outputTemplate"]`. | PR-BUY-01 | Test |
| SYS-MCP-05 | The Storefront shall get all data through `tools/call` and shall declare no `connectDomains`. Images load only from the Shelf origin. | PR-BUY-01 | Inspection |
| SYS-MCP-06 | The Storefront shall open the Pay page with `ui/open-link`, and shall poll `get_order_status` every 3 s for at most 10 minutes. | PR-BUY-04 | Test, Demo |
| SYS-MCP-07 | Read-only tools shall carry `readOnlyHint: true`. `request_refund` shall carry `destructiveHint: false` and creates a request only. | PR-BUY-06 | Inspection |
| SYS-MCP-08 | The MCP endpoint shall accept requests only from the hostnames in its allow list, and shall rate-limit each client address. | PR-BUY-01 | Test |
| SYS-MCP-09 | The Storefront shall render in Claude (custom connector) and ChatGPT (developer mode). | PR-BUY-01 | Demo |

## Functional requirements: Cart API

> **What this is.** What the Cart API v1 endpoints of each store guarantee.
>
> **Why it comes here.** PayPal defines the contract. We must match its paths and its error semantics exactly.
>
> **Shelf example.** A cart with an out-of-stock item answers 200 with a `validation_issues` entry, not 422 (SYS-CART-03).
>
> **What it produces.** SYS-CART-01 to SYS-CART-05.

| ID | Requirement | Traces to | Verify |
| --- | --- | --- | --- |
| SYS-CART-01 | The system shall implement `POST /merchant-cart`, `GET /merchant-cart/{id}`, `PUT /merchant-cart/{id}` and `POST /merchant-cart/{id}/checkout` under `/api/stores/{slug}/`. | PR-AGT-01 | Test |
| SYS-CART-02 | A `PUT` shall replace the whole cart. It shall not merge. | PR-AGT-01 | Test |
| SYS-CART-03 | A business problem shall return 200 with `validation_issues`. 400 means a malformed request, 404 an unknown cart, 422 a hard reject. | PR-AGT-02 | Test |
| SYS-CART-04 | Cart IDs shall match `CART-[A-Z0-9]+`. | PR-AGT-01 | Test |
| SYS-CART-05 | Each request shall carry a bearer store key. The key check shall be one replaceable function. | PR-AGT-03 | Test, Inspection |

## Functional requirements: AI

> **What this is.** What the system guarantees about model output.
>
> **Why it comes here.** A model can be wrong. Its output must never reach a buyer, or set a price, without a person.
>
> **Shelf example.** Gemini suggests "$28 to $34". The product stays a draft until Maya types or confirms "$32.00".
>
> **What it produces.** SYS-AI-01 to SYS-AI-05.

| ID | Requirement | Traces to | Verify |
| --- | --- | --- | --- |
| SYS-AI-01 | The system shall extract product fields from a photo with `gemini-3.8-flash` and a JSON schema response. | PR-SEL-04 | Test |
| SYS-AI-02 | The system shall not publish a product until the seller confirms its price. | PR-SEL-05 | Test |
| SYS-AI-03 | The system shall store which fields the model filled, and the Seller app shall mark them. | PR-SEL-04 | Test |
| SYS-AI-04 | The system shall reject a model answer that does not match the schema, retry once, then mark the photo Failed with a reason. | PR-SEL-04 | Test |
| SYS-AI-05 | The system shall treat text inside a photo as data, never as an instruction. | PR-SEL-04 | Test |

## Functional requirements: seller

> **What this is.** What the system guarantees for the Seller app.
>
> **Why it comes here.** The seller owns the store, the products and the refund decisions. Access control lives here.
>
> **Shelf example.** Maya can see only her own orders. A request for another store's order answers "not found".
>
> **What it produces.** SYS-SEL-01 to SYS-SEL-05.

| ID | Requirement | Traces to | Verify |
| --- | --- | --- | --- |
| SYS-SEL-01 | The system shall sign the seller in with Log in with PayPal and store the PayPal account ID and email as the payee. | PR-SEL-01 | Test |
| SYS-SEL-02 | Every Seller app request shall check that the store belongs to the signed-in seller; a refused request shall read as not found. | PR-SEL-07 | Test |
| SYS-SEL-03 | The system shall accept image files up to 10 MB each (JPEG, PNG, WebP, HEIC) and store them in R2. | PR-SEL-03 | Test |
| SYS-SEL-04 | The system shall turn a photo into a draft within 20 s (p95) after upload. | PR-SEL-04 | Analysis |
| SYS-SEL-05 | The system shall send a Web Push notification on Paid and on Refund requested, if the seller allowed it. | PR-SEL-10 | Demo |

## Non-functional requirements

> **What this is.** Limits on performance, security, operation and accessibility.
>
> **Why it comes here.** These apply to every flow. A fast flow that leaks a secret still fails.
>
> **Shelf example.** NFR-SEC-01 keeps the PayPal secret out of the code; a check script reads the repository for it.
>
> **What it produces.** NFR-PERF, NFR-SEC, NFR-OPS and NFR-A11Y requirements.

| ID | Requirement | Verify |
| --- | --- | --- |
| NFR-PERF-01 | An MCP tool call shall answer within 1.5 s (p95), not counting PayPal and model time. | Analysis |
| NFR-PERF-02 | A Seller app page shall be interactive within 2.5 s on a mid-range phone on 4G. | Analysis |
| NFR-SEC-01 | Secrets shall live only in Worker secrets. No secret in code, logs or the Storefront. | Inspection |
| NFR-SEC-02 | Pay page links and cart tokens shall be signed with HMAC and expire after 30 minutes. | Test |
| NFR-SEC-03 | Logs shall hold no buyer email, address, token or photo content. | Inspection |
| NFR-SEC-04 | Seller sessions shall use an HttpOnly, Secure, SameSite=Lax cookie that expires after 7 days. | Test |
| NFR-OPS-01 | The system shall deploy as one Cloudflare Worker on the Workers Paid plan. | Inspection |
| NFR-OPS-02 | Each order state change shall write one row to the order timeline. | Test |
| NFR-A11Y-01 | The Seller app, Pay page, Try page and Storefront shall meet WCAG 2.2 AA contrast and keyboard use. | Inspection |
| NFR-A11Y-02 | All motion shall stop under `prefers-reduced-motion`. | Inspection |

## Constraints

> **What this is.** Design constraints from the business and the platforms.
>
> **Why it comes here.** A constraint removes options before architecture starts.
>
> **Shelf example.** CON-03 pins Next.js to 16.4.6, because the Cloudflare adapter declares `>=16.4.5`.
>
> **What it produces.** CON-01 to CON-06.

| ID | Constraint | Source |
| --- | --- | --- |
| CON-01 | Cloudflare Workers for the frontend and the backend, as one Worker. | C-5 |
| CON-02 | Gemini on Vertex AI, model `gemini-3.8-flash`. | C-5 |
| CON-03 | Next.js `16.4.6` with `@opennextjs/cloudflare` `1.20.16`, Node runtime only. | Adapter peer range, 11 Nov 2026 (ADR-011) |
| CON-04 | USD only; US sandbox accounts. | C-4, C-6 |
| CON-05 | MIT license, public repository at submission. | C-2 |
| CON-06 | Submit by 12 Nov 2026, 12:00 PT. | C-1 |

## The principle to remember

Every "shall" names its source and its proof, so a coding agent can build it and a test can catch it.
