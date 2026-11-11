# Shelf

**Shop and pay with PayPal inside AI assistants.**

Shelf is the PayPal checkout that lives inside the chat. A buyer asks an AI assistant for something, finds a small seller's product in an interactive Storefront that renders in the conversation, picks a variant and pays with PayPal. A seller gets on Shelf by sending phone photos: Gemini drafts each product, and the seller sets every price.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/), November 2026. Everything runs on the PayPal **sandbox**: no real money moves.

## Try it in five minutes

| Step | What to do | What you should see |
| --- | --- | --- |
| 1 | Open the [Try page](https://shelf.160422733171.workers.dev/try) and ask for something, or tap an example. | The real Storefront in a chat-style page, with products from stores real sellers published. |
| 2 | Tap a product, pick an option, **Add to cart**, change the quantity. | The server reprices the cart on every change; the total and shipping come from stored prices only. |
| 3 | Tap **Pay with PayPal**. Approve in the PayPal sandbox with the buyer login shown at the top of the Try page. | The card says "Waiting for PayPal", then turns to **Paid** on its own (it polls `get_order_status`). |
| 4 | Ask for a refund from the paid order card. | "Waiting for the seller". No tool, agent or model can approve a refund; only the seller can. |
| 5 | Open the [Seller app](https://shelf.160422733171.workers.dev/app) and log in with a PayPal sandbox business account. | Name a store, add photos, check drafts, set prices, publish. Orders, tracking and refund decisions live here. |

In your own assistant: add `https://shelf.160422733171.workers.dev/mcp` as a custom connector (Claude) or an app in developer mode (ChatGPT), then ask for something a Shelf seller sells, for example "laddu under $20".

## Where it works

| Surface | Works in |
| --- | --- |
| The Storefront app (cards, cart, checkout, Paid) | Assistants that support MCP Apps, such as Claude and ChatGPT. |
| The Shelf tools: `search_products`, `show_product`, `update_cart`, `start_checkout`, `get_order_status`, `request_refund` | Any assistant that connects to a remote MCP server. Each tool also answers in plain text. |
| The Cart API (`/api/stores/{slug}/merchant-cart`) | Any agent that can make HTTP calls, with a store key from the Seller app. Shapes follow PayPal's Cart API v1 contract. |

## How it works

```mermaid
flowchart LR
  B[Buyer in an AI assistant] -->|MCP tools| W
  SF[Storefront MCP App] -->|tools via host| W
  SF -->|ui/open-link| P[Pay page, PayPal JS SDK v6]
  P -->|capture| W
  S[Seller app] --> W
  A[Other agents] -->|Cart API v1| W
  subgraph W[One Cloudflare Worker]
    N[Next.js via OpenNext] --- M[/mcp/]
    Q[Queue consumer] --- C[5-minute reconciler]
  end
  W --> D[(D1)]
  W --> R[(R2 photos)]
  W -->|Orders v2, Payments, Webhooks, Log in with PayPal| PP[PayPal sandbox]
  Q -->|AI Gateway| G[Gemini 3.8 Flash on Vertex AI]
```

The rules that keep money safe, each with a test:

- **The server sets every amount.** Prices come from stored variants; a `price` sent by a client is ignored (INV-01).
- **Every PayPal write carries a `PayPal-Request-Id` built from Shelf's own records** (`order:{cart}:v{n}`, `capture:{order}`, `refund:{request}`), so a retry acts once.
- **Checkout runs in phases around the PayPal call.** A crash between creating the PayPal order and recording it is repaired by the next call with the same key.
- **Webhooks are hints.** After PayPal's signature check, Shelf reads the order from PayPal and applies that truth through the same function the 5-minute reconciler uses.
- **Only the seller approves a refund**, in two taps; the amount never exceeds what was captured.
- **No implicit state machines.** Product, cart, order and refund states move only through explicit transition tables ([code quality rules](docs/engineering/code-quality.md)).

Stack: Next.js 16.4 and React 19.3 on Cloudflare Workers (one Worker via OpenNext), MCP over stateless Streamable HTTP with `@modelcontextprotocol/ext-apps`, D1, R2, Queues, Cron, PayPal REST (Orders v2, Payments, Webhooks, Log in with PayPal) and JS SDK v6, Gemini 3.8 Flash on Vertex AI through Cloudflare AI Gateway.

## Verified and not verified

What has been proven, and how. Updated as each live check runs.

| Claim | Status | Evidence |
| --- | --- | --- |
| Cart pricing, state machines, idempotency keys, signed tokens | Verified, automated | `pnpm check`: 185 tests, typecheck, schema check, test-case traceability and a secret scan, in CI on every push |
| D1 adapters run their real SQL (guarded batches, unique indexes) | Verified, automated | Tests run on Node's SQLite with the real migration (`tests/support/d1.ts`) |
| MCP surface: tools, `_meta`, MIME, no `connectDomains` | Verified, automated and live | TC-MCP-01; `tools/list` on the deployed Worker |
| Storefront views and the Paid moment | Verified in a browser | Hosted through `AppBridge` on the Try page; order views with fixture tool results |
| Seller app screens | Verified in a browser, locally | Walked at 390 px: store, photos, failed read, Fill in yourself, publish guard, store key |
| PayPal sandbox credentials on the Worker | Verified live | `/api/health` gets an OAuth token |
| Log in with PayPal redirect | Verified live | `/api/auth/paypal/start` redirects with the scopes and a `state` cookie |
| An unsigned webhook changes nothing | Verified live | 400 before any PayPal call |
| A full sandbox payment, approval to Paid | **Not yet verified live** | Covered by tests against a PayPal fake; live run pending |
| Log in with PayPal round trip | Verified live | A sandbox business seller signed in; Shelf stored its payer ID. The app's own owner account cannot sign in as a seller, by design |
| PayPal webhook delivery | **Not yet verified live** | Webhook ID is set; waiting for the first real event |
| Photo to draft with Gemini | Verified live | Four real product photos became drafts through Gemini 3.8 Flash on Vertex AI; the seller set every price |
| Rendering inside Claude and ChatGPT | **Not yet verified** | Needs the connector added in each assistant |
| Cart API with a live key | **Not yet verified live** | `scripts/cart_agent.mjs` is ready |

## Known limits

- Sandbox only. R1 refunds are full refunds.
- One store per seller; USD only; flat shipping per order.
- Web Push is not built: the Orders screen polls every 5 seconds.
- No mock data: the Try page shows only what real sellers published.

## Run it locally

```bash
pnpm install
cp .dev.vars.example .dev.vars          # fill in sandbox values
pnpm wrangler d1 migrations apply shelf --local
pnpm build:worker && pnpm wrangler dev
pnpm check                              # types, tests, schema
```

## Documents

Product: [Concept](docs/product/00-concept.md) · [PRD](docs/product/02-PRD.md) · [SyRS](docs/product/03-SyRS.md). The business requirements and founder decisions are kept private.

Engineering: [conventions](docs/engineering/README.md) · [product](docs/engineering/01-product-contract.md) · [domain](docs/engineering/02-domain-contract.md) · [architecture](docs/engineering/03-architecture-contract.md) · [ADRs](docs/engineering/adr/) · [data](docs/engineering/04-data-contract.md) · [interfaces](docs/engineering/05-interface-contract.md) · [quality](docs/engineering/06-quality-contract.md) · [implementation](docs/engineering/07-implementation-contract.md) · [code quality](docs/engineering/code-quality.md) · [progress](docs/engineering/PROGRESS.md)

Design: [design system](docs/design/DESIGN-SYSTEM.md) · [brand](docs/design/BRAND.md)

## License

MIT. See [LICENSE](LICENSE).
