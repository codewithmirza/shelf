# Shelf

**Shop and pay with PayPal inside AI assistants.**

Shelf is the PayPal checkout that lives inside the chat. A buyer finds a small seller's product in an AI assistant such as Claude or ChatGPT, picks a variant, and pays with PayPal from an interactive storefront that renders in the conversation. A seller gets on Shelf by sending phone photos.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (November 2026). Status: in development. This README becomes the judge guide in task T-27.

## Try it

- Try page: _link added on deploy_
- Sandbox buyer login: _shown on the Try page_
- Video: _link added on submission_

## How it works

| Part | What it does |
| --- | --- |
| Storefront | An MCP App that renders product cards, a cart and PayPal checkout in assistants that support MCP Apps (Claude, ChatGPT); the same tools answer as text in any MCP client. |
| Pay page | Runs the PayPal button (JS SDK v6); the Storefront opens it and shows "Paid" when the capture lands. |
| Seller app | Photos in, drafts out (Gemini 3.8 Flash on Vertex AI); the seller confirms prices, ships and approves refunds. |
| Cart API | Each store answers PayPal's Cart API v1 contract, so any agent can buy from it. |

Stack: Next.js 16.2 on Cloudflare Workers (one Worker, OpenNext), MCP over Streamable HTTP, D1, R2, Queues, PayPal Orders v2, Payments, Webhooks and Log in with PayPal, Gemini 3.8 Flash on Vertex AI through Cloudflare AI Gateway.

## Documents

Product: [Concept](docs/product/00-concept.md) · [PRD](docs/product/02-PRD.md) · [SyRS](docs/product/03-SyRS.md). The business requirements (BRD) and founder decisions are kept private.

Engineering: [conventions](docs/engineering/README.md) · [Gate 1 product](docs/engineering/01-product-contract.md) · [Gate 2 domain](docs/engineering/02-domain-contract.md) · [Gate 3 architecture](docs/engineering/03-architecture-contract.md) · [ADRs](docs/engineering/adr/) · [Gate 4 data](docs/engineering/04-data-contract.md) · [Gate 5 interfaces](docs/engineering/05-interface-contract.md) · [Gate 6 quality](docs/engineering/06-quality-contract.md) · [Gate 7 implementation](docs/engineering/07-implementation-contract.md) · [tasks](docs/engineering/tasks.yaml)

Design: [design system](docs/design/DESIGN-SYSTEM.md) · [brand](docs/design/BRAND.md)

## License

MIT. See [LICENSE](LICENSE).
