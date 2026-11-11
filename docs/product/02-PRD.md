# Shelf · Product requirements (PRD)

> **What this is.** What Shelf does for each person, as product requirements with priorities. It says what, not how.
>
> **Why it comes here.** It turns the concept and the business objectives into requirements. The SyRS then turns each requirement into testable "shall" statements, and Gate 1 turns them into flows.
>
> **Shelf example.** PR-BUY-03 says Ben pays with PayPal and sees "Paid" in the chat. SYS-PAY-05 then says how fast, and AC-BUY-03-04 says how we test it.
>
> **What it produces.** The release scope, the product requirements by area, the experience rules and the copy rules.

Status: written 10 Nov 2026. Sources: `00-concept.md` and the founders' private business requirements.

## Release scope

> **What this is.** Which requirements ship in the hackathon release (R1) and which wait.
>
> **Why it comes here.** Two days of build time. Every "Must" is on the critical path; nothing else starts before the Musts work.
>
> **Shelf example.** Web Push for the seller is "Should". If it is not done by 12 Nov 18:00 IST, the Seller app polls instead.
>
> **What it produces.** The priority rules.

| Priority | Meaning | R1 rule |
| --- | --- | --- |
| Must | Without it, the demo fails or a rule breaks. | Ships in R1. |
| Should | It makes the demo clearly better. | Ships in R1 if the Musts are done by 12 Nov 14:00 IST. |
| Could | Nice to have. | After the hackathon. |

## Requirements: the seller (Maya)

> **What this is.** What Maya can do in the Seller app.
>
> **Why it comes here.** Sellers are the supply. With no published products, the Storefront has nothing to show.
>
> **Shelf example.** Maya photographs three mugs. Two minutes later she sees three drafts with titles, details and suggested prices, and confirms each price.
>
> **What it produces.** PR-SEL-01 to PR-SEL-10.

| ID | Requirement | Priority |
| --- | --- | --- |
| PR-SEL-01 | Maya signs in with her PayPal account ("Log in with PayPal"). Her PayPal account becomes the account that receives her sales. | Must |
| PR-SEL-02 | Maya creates one store with a name and a link name (slug). | Must |
| PR-SEL-03 | Maya adds 1 to 10 photos at a time from her phone camera or files. | Must |
| PR-SEL-04 | For each photo, Shelf drafts a product: title, short description, category, variants and a suggested price range. Shelf marks every field it filled. | Must |
| PR-SEL-05 | Maya edits any field and confirms the price before a product can publish. | Must |
| PR-SEL-06 | Maya publishes or unpublishes a product. | Must |
| PR-SEL-07 | Maya sees each order with its state and timeline. | Must |
| PR-SEL-08 | Maya adds a carrier and a tracking number to an order. The buyer sees it. | Must |
| PR-SEL-09 | Maya approves or rejects a refund request in two taps or fewer. | Must |
| PR-SEL-10 | Maya gets a notification on her phone when an order is paid or a refund is requested. | Should |
| PR-SEL-11 | Maya sets a refund policy in one sentence (for example "Refunds within 14 days"). The Storefront shows it. | Should |
| PR-SEL-12 | Maya imports a WhatsApp or Instagram catalog. | Could |

## Requirements: the buyer (Ben)

> **What this is.** What Ben can do in the Storefront inside Claude or ChatGPT, and on the Pay page.
>
> **Why it comes here.** This is the part judges remember. Differentiators D1 to D3 of the concept live here.
>
> **Shelf example.** Ben types "blue mug under $40". Three cards appear in the chat. He taps one, picks "Large", adds it, taps "Pay with PayPal", approves, and the card turns to "Paid".
>
> **What it produces.** PR-BUY-01 to PR-BUY-08.

| ID | Requirement | Priority |
| --- | --- | --- |
| PR-BUY-01 | Ben asks in plain words. The Storefront shows matching products as cards with photo, title, price and store. | Must |
| PR-BUY-02 | Ben opens a product, sees its photos and description, and picks a variant. | Must |
| PR-BUY-03 | Ben adds, removes and changes quantities in one cart. The cart shows the items, shipping and total. One cart holds products of one store. | Must |
| PR-BUY-04 | Ben taps "Pay with PayPal". The Pay page opens, he approves in PayPal, and the Storefront shows "Paid" with no typing. | Must |
| PR-BUY-05 | Ben sees the order state and tracking in the Storefront. | Must |
| PR-BUY-06 | Ben asks for a refund with a reason. He sees "Waiting for the seller", then the decision. | Must |
| PR-BUY-07 | If the Storefront cannot render (a host without MCP Apps), Ben still gets a text answer with the same facts and a payment link. | Must |
| PR-BUY-08 | Ben sees the seller's refund policy before he pays. | Should |

## Requirements: other agents (the Cart API)

> **What this is.** What any AI agent can do with a Shelf store through PayPal's Cart API v1 contract.
>
> **Why it comes here.** It makes every Shelf store "agent-ready" in the shape PayPal defines, which supports the Best Use of Agentic Commerce prize.
>
> **Shelf example.** A test agent creates a cart for Maya's store, changes the quantity, and checks out with an approved PayPal order.
>
> **What it produces.** PR-AGT-01 to PR-AGT-03.

| ID | Requirement | Priority |
| --- | --- | --- |
| PR-AGT-01 | Each published store answers the Cart API v1 contract: create, read, replace and check out a cart. | Must |
| PR-AGT-02 | A cart problem (out of stock, price changed) returns as a validation issue the agent can read, not as an error. | Must |
| PR-AGT-03 | A store gives each agent a store key. Shelf can switch to PayPal's own token check later with no change to the store. | Should |

## Requirements: the judge (Jo)

> **What this is.** What a judge needs to score Shelf without setting up anything.
>
> **Why it comes here.** The rules say judges may judge from the text, images and video alone. Many will not add a connector.
>
> **Shelf example.** Jo opens the Try page, picks a mug, pays with the sandbox buyer shown on the page, and sees "Paid".
>
> **What it produces.** PR-JDG-01 to PR-JDG-04.

| ID | Requirement | Priority |
| --- | --- | --- |
| PR-JDG-01 | The Try page runs the same Storefront in a hosted page with a chat box, against the stores real sellers have published (no mock data). | Must |
| PR-JDG-02 | The Try page shows the sandbox buyer login to use. | Must |
| PR-JDG-03 | The README gives a five-minute judge path, the architecture, and a "verified and not verified" table. | Must |
| PR-JDG-04 | Each order shows a timeline of who did what: the agent, the buyer, the seller, PayPal. | Should |

## Experience rules

> **What this is.** Rules every screen follows. The design system in `docs/design/` gives the visual form.
>
> **Why it comes here.** "The UX must be right in one go" (founder, 10 Nov 2026). Rules decided once stop each screen from deciding them again.
>
> **Shelf example.** The Pay button never says "Processing" for more than 10 seconds without saying what happens next.
>
> **What it produces.** XR-01 to XR-08.

| ID | Rule |
| --- | --- |
| XR-01 | One primary action per screen or card. |
| XR-02 | State shows in words and in form. "Paid" is a word and a mark, never colour alone. |
| XR-03 | Every wait over 1 second shows progress. Every wait over 10 seconds says what happens next. |
| XR-04 | Money is always shown with currency and two decimals: "$32.00". |
| XR-05 | Anything the model wrote is marked as a suggestion until a person confirms it. |
| XR-06 | No money moves without a person's tap: Ben in PayPal, Maya on a refund. |
| XR-07 | The Seller app works one-handed on a 375 px wide phone. |
| XR-08 | Motion is short and purposeful, and stops under reduced motion. |

## Copy rules

> **What this is.** How Shelf talks.
>
> **Why it comes here.** Copy is part of the product. A vague error message loses a sale.
>
> **Shelf example.** "PayPal didn't finish. Your cart is saved. Try again." and not "Error 500".
>
> **What it produces.** The copy rules.

- Plain, short sentences. Say what happened and what to do next.
- One name per thing: Storefront, Pay page, Seller app, Try page, store, product, variant, cart, order, refund request. These match the Gate 2 glossary.
- No exclamation marks in errors. No blame. No "Oops".
- Buttons say what they do: "Pay with PayPal", "Publish", "Approve refund".

## The principle to remember

Each requirement names a person and a priority, and every money step keeps a person in it.
