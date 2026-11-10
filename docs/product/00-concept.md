# Shelf · Concept

> **What this is.** The idea of Shelf in one place: the problem, the people, the product, the position against other products, and what we do not build.
>
> **Why it comes here.** Every later document starts from this one. If the concept is not fixed, the PRD and the SyRS describe different products.
>
> **Shelf example.** Maya sells hand-thrown mugs on Instagram. Ben asks Claude for "a blue mug under $40". Maya's mug appears inside the chat. Ben picks a size and pays with PayPal. Maya's phone shows the sale.
>
> **What it produces.** The problem statement, the users, the product in one sentence, the two parts of the product, the position, the non-goals and the sources.

Status: written 10 Nov 2026 for the PayPal AI Hackathon (submissions close 12 Nov 2026, 12:00 PT). Owner: Mirza Anwaarullah Baig.

## The product in one sentence

> **What this is.** The sentence we use everywhere: in the README, the Devpost form, the video and the pitch.
>
> **Why it comes here.** Judges and automated review read the first sentence first. One sentence keeps every surface the same.
>
> **Shelf example.** The first line of the README and the first 15 seconds of the video say this sentence.
>
> **What it produces.** The sentence and its short form.

**Shelf is the PayPal checkout that lives inside the chat.** A buyer finds a small seller's product in Claude or ChatGPT, picks a variant, and pays with PayPal in an interactive storefront that renders in the conversation. A seller gets on Shelf by sending phone photos.

Short form: **Shop and pay with PayPal inside Claude and ChatGPT.**

## The problem

> **What this is.** The two problems Shelf solves, with the evidence for each and how strong that evidence is.
>
> **Why it comes here.** The Potential Impact criterion asks for "a credible, specific case for solving a real problem for a real audience". A problem without evidence fails that criterion.
>
> **Shelf example.** Maya has no website and no product feed. To an AI shopping agent, her mugs do not exist.
>
> **What it produces.** Problem P1 (sellers) and problem P2 (buyers).

| ID | Problem | Evidence | Strength |
| --- | --- | --- | --- |
| P1 | Small sellers are not visible to AI shopping agents, because their catalogs are not machine-readable. | PayPal's Agentic Commerce Pulse Survey (498 US merchants, 23 Feb to 3 Mar 2026): "Only 23% of small businesses say 80% or more of their product catalog is structured in AI-readable formats." PayPal Store Sync needs Orders v2, US buyers, USD and an access request. | Verified, from PayPal's own survey and docs. |
| P2 | A buyer who shops through an AI assistant gets a text link at the end. The buyer does not see the product image, the variant, or the total in the conversation. | Of the rival hackathon entries we inspected (README level, 5 and 10 Nov 2026), each ends the purchase with an approval link in text. | Inferred. This is a design hypothesis. We state it as one. |

## The people

> **What this is.** The three people Shelf serves, named once and used in every document.
>
> **Why it comes here.** Requirements are written for a person. A requirement with no person is a feature with no reason.
>
> **Shelf example.** "Maya approves a refund in two taps" is a requirement. "Refunds are supported" is not.
>
> **What it produces.** Three personas.

| Persona | Who | What they want | What stops them today |
| --- | --- | --- | --- |
| Maya, the maker | A US-based maker who sells through Instagram, Etsy or messages. She has photos, not a store. | Sales from a new channel with no setup work. | No catalog feed, no time, no developer. |
| Ben, the chat buyer | A person who already asks Claude or ChatGPT for shopping ideas. | To see the thing, pick it and pay without leaving the conversation. | The assistant ends with a link he must trust. |
| Jo, the judge | A hackathon judge or reviewer with three minutes. | To see the full flow work and believe it. | Setting up a connector takes time; many judges will not do it. |

## What we build

> **What this is.** The two parts of Shelf and the one page that ties them together for judges.
>
> **Why it comes here.** The architecture follows the parts. If the parts are not clear, the system design has no shape.
>
> **Shelf example.** Maya uses the Seller app. Ben uses the Storefront. Jo uses the Try page.
>
> **What it produces.** The four surfaces of Shelf.

| Surface | For | Where it runs | What it does |
| --- | --- | --- | --- |
| Storefront | Ben | Inside Claude and ChatGPT, as an MCP App | Shows product cards, a variant picker and a cart. Starts PayPal checkout. Shows payment, tracking and refund status. |
| Pay page | Ben | `/pay/{order}` on the Shelf origin, opened from the Storefront | Runs the PayPal button (JS SDK v6). The host chat cannot run PayPal inside its sandboxed frame, so approval happens here. |
| Seller app | Maya | A mobile web app (PWA) | Photos in, drafts out, review and publish, orders, tracking, refund decisions. |
| Try page | Jo | `/try` on the Shelf origin | The same Storefront in a hosted page, so a judge can buy in the PayPal sandbox in one minute with no connector. |

Shelf also implements PayPal's Cart API v1 contract for each store. Any agent that speaks that contract can buy from a Shelf store.

## The position

> **What this is.** Where Shelf stands against the products and hackathon entries that already exist, said honestly.
>
> **Why it comes here.** The Innovation criterion asks whether the project differs from existing concepts. An overclaim here costs trust with every reviewer.
>
> **Shelf example.** We do not say "first". We say "among the PayPal agent-store entries we reviewed on 10 Nov 2026, none renders checkout inside the chat".
>
> **What it produces.** The differentiators and the claims we may and may not make.

**The field.** Photo-to-agent-store is the most crowded idea in this hackathon. We found at least 17 public entries. The strongest, `RAK2315/shopfront-agent`, already turns photos into a PayPal catalog and implements Cart API v1. One entry, `async-rent/async` (pull request 59, 8 Nov 2026), adds an in-chat PayPal checkout for gear rental; its pull request says it was not yet tested in a real host.

**So Shelf competes on the buyer side.** Most entries make sellers buyable by agents. Shelf is where the buyer sees and pays. Three proofs carry this:

| ID | Differentiator | How a judge sees it |
| --- | --- | --- |
| D1 | The same Storefront runs in two hosts, Claude and ChatGPT. | Both on video, side by side. |
| D2 | The full lifecycle shows in the conversation: cart, payment, tracking, refund. | The Storefront card changes state with no typing. |
| D3 | Every money step has a person in it. The buyer approves in PayPal. The seller approves each refund. | The seller's tap is on video. |

**Claims we may make.** "Among the entries we reviewed, none renders an interactive checkout inside the chat" (dated). "Compatible with PayPal's Cart API v1 contract."

**Claims we may not make.** "First". "Only". "Integrated with PayPal Store Sync" (we do not have Store Sync access). Any number we did not measure.

## Non-goals

> **What this is.** What Shelf does not do in this release, so no task spends time on it.
>
> **Why it comes here.** With two days to build, each wrong task is a lost feature.
>
> **Shelf example.** Maya cannot import her WhatsApp catalog in this release. She uploads photos.
>
> **What it produces.** The list of non-goals. Some return in later releases.

- No marketplace search across all sellers on the open web. Shelf searches Shelf stores only.
- No WhatsApp, Instagram or Telegram import in the hackathon release.
- No PayPal Partner Referrals onboarding and no platform fee in the hackathon release.
- No production PayPal. The hackathon release runs in the PayPal sandbox only.
- No Indian sellers for revenue in the first 60 days. Store Sync is US, USD and physical goods only.
- No automatic refund by the model. A seller decides every refund.
- No claim of PayPal Store Sync enrollment.

## Sources

| Source | Read |
| --- | --- |
| Hackathon overview and rules: https://paypalaihackathon.devpost.com/ and /rules | 5 and 10 Nov 2026 |
| PayPal Store Sync overview: https://docs.paypal.ai/growth/agentic-commerce/store-sync/overview | 10 Nov 2026 |
| PayPal Cart API: https://developer.paypal.com/api/agentic-commerce/v1 | 10 Nov 2026 |
| MCP Apps specification: https://github.com/modelcontextprotocol/ext-apps | 10 Nov 2026 |
| Rival repositories (README level): RAK2315/shopfront-agent, JasonColapietro/suede-shelf, the AgentShelf repositories, ttimesai-star/leafline-agent-store, muhammad-jawad-ali/agentstall, rohith1005H/AgentBaazar, async-rent/async pull request 59 | 5 and 10 Nov 2026 |

## The principle to remember

Shelf does not make one more seller buyable; it is the place in the chat where the buyer sees, pays and gets help, with a person at every money step.
