# Gate 2 · Domain contract

> **What this is.** The words, the entities, the state machines, the invariants and who may do what in Shelf.
>
> **Why it comes here.** Gate 1 says what people do. This gate fixes the model those flows act on. Code, tables, events and logs use only these words.
>
> **Shelf example.** "Listing", "item" and "SKU" all could mean a thing Maya sells. Shelf uses Product for the thing and Variant for the choice inside it. A Variant has a SKU field; it is not called a SKU.
>
> **What it produces.** The glossary, the entities, four state machines, the invariants and the authority matrix.

## Glossary

> **What this is.** One term per concept, with the words not allowed for it.
>
> **Why it comes here.** The model is written in these words. Without one term, two files name one thing two ways and an agent builds two of it.
>
> **Shelf example.** The Storefront is the in-chat UI. "Widget" is not allowed in product code or copy; it is allowed only in comments that quote the MCP specification.
>
> **What it produces.** The glossary table.

| Term | Meaning | Not | Screen word |
| --- | --- | --- | --- |
| Seller | A person who owns one store and receives its sales in their PayPal account. | Merchant (except in PayPal API fields), vendor, user | You |
| Buyer | A person who buys through the Storefront, the Try page or an agent. Has no Shelf account. | Customer, shopper, user | You |
| Agent | A program that calls the Cart API or the MCP tools for a buyer. | Bot, client | — |
| Host | The chat app that runs the Storefront: Claude or ChatGPT. | Platform, client | Claude, ChatGPT |
| Store | One seller's set of products, with a slug. | Shop, catalog | Store |
| Slug | The unique link name of a store. | Handle, path | Link |
| Photo | An image a seller uploads. | Image, picture (in code) | Photo |
| Extraction | The model's reading of one photo into product fields. | Analysis, scan | Reading |
| Product | A thing a seller sells. Has one or more variants. | Listing, item, SKU | Product |
| Variant | One choice of a product, with its own price and stock. | Option, SKU | Size, colour (the option name) |
| Draft | A product state: not visible to buyers. | Pending | Draft |
| Cart | A list of variants and quantities from one store, with server totals. | Basket, bag | Cart |
| Order | The record of one cart sent to PayPal, from creation to the end. | Purchase, transaction | Order |
| Capture | PayPal taking the approved money. | Charge, payment (in code) | Paid |
| Refund request | A buyer's request for money back. The seller decides it. | Return, dispute | Refund request |
| Refund | PayPal returning money for a refund request the seller approved. | Reversal | Refund |
| Tracking | A carrier name and a tracking number on an order. | Shipment (in code) | Tracking |
| Event | One row of an order's timeline: who did what and when. | Log, activity | Timeline |
| Webhook event | A message from PayPal about a payment change. | Notification, callback | — |
| Storefront | The Shelf UI inside a host, served as an MCP App resource. | Widget, app, plugin | — |
| Pay page | The hosted page that runs the PayPal button for one order. | Checkout page | — |
| Seller app | The mobile web app for sellers. | Dashboard, admin | — |
| Try page | The hosted page where a judge uses the Storefront with no setup. | Demo page, playground | — |
| Store key | A secret an agent sends to use a store's Cart API. | API key, token (alone) | Store key |
| Order token | A signed value that lets a buyer read one order. | Receipt ID | — |

## Entities

> **What this is.** The things Shelf stores, with their owner and key fields. Gate 4 turns each into a table.
>
> **Why it comes here.** State machines and invariants need entities to act on.
>
> **Shelf example.** An Order belongs to one Store and one Cart, and holds the PayPal order ID and capture ID.
>
> **What it produces.** The entity table.

| Entity | Belongs to | Key fields | Notes |
| --- | --- | --- | --- |
| Seller | — | PayPal account ID, PayPal email | Created on first Log in with PayPal. |
| Store | Seller (one each in R1) | slug, name, refund policy, currency USD | The free plan allows 10 products. |
| Store key | Store | key hash, label | Shown once at creation. |
| Photo | Store | R2 key, state, extraction | |
| Product | Store | title, description, category, state, model fields | |
| Variant | Product | option values, price in cents, stock, SKU | Price is null until the seller confirms. |
| Cart | Store | cart ID `CART-…`, items, totals, version, state, channel | Channel: storefront, cart_api, try. |
| Order | Store, Cart | PayPal order ID, capture ID, state, amount, shipping, tracking | |
| Refund request | Order | reason, amount, state, decline reason, PayPal refund ID | |
| Event | Order | actor, type, data, time | Append only. |
| Webhook event | — | PayPal event ID, type, verified | Unique PayPal event ID. |
| Push subscription | Seller | endpoint, keys | Web Push. |

## State machines

> **What this is.** The allowed states of Product, Cart, Order and Refund request, and the only transitions between them.
>
> **Why it comes here.** A state not in the machine is a bug. Each transition names who may cause it.
>
> **Shelf example.** An Order cannot go from Created to Refunded. It must be Captured first.
>
> **What it produces.** SM-PRD, SM-CRT, SM-ORD and SM-RFD with transition IDs.

### SM-PRD Product

| ID | From | To | By | Condition |
| --- | --- | --- | --- | --- |
| T-PRD-01 | (none) | Draft | System | An extraction succeeds, or the seller taps "Fill in". |
| T-PRD-02 | Draft | Published | Seller | Every variant has a confirmed price (INV-03). |
| T-PRD-03 | Published | Draft | Seller | Unpublish. |
| T-PRD-04 | Draft | Deleted | Seller | Delete. A product with orders is never deleted; it can only be Draft. |

### SM-CRT Cart

| ID | From | To | By | Condition |
| --- | --- | --- | --- | --- |
| T-CRT-01 | (none) | Ready | Buyer, Agent | Create with no validation issues. |
| T-CRT-02 | (none) | Incomplete | Buyer, Agent | Create with a validation issue. |
| T-CRT-03 | Ready, Incomplete | Ready, Incomplete | Buyer, Agent | Replace items; recompute; version + 1. |
| T-CRT-04 | Ready | Checking out | Buyer, Agent | `start_checkout` or Cart API checkout. |
| T-CRT-05 | Checking out | Completed | System | The order is Captured. |
| T-CRT-06 | Ready, Incomplete, Checking out | Expired | System | 3 hours with no change and no capture. |

### SM-ORD Order

| ID | From | To | By | Condition |
| --- | --- | --- | --- | --- |
| T-ORD-01 | (none) | Created | System | PayPal created the order. |
| T-ORD-02 | Created | Approved | Buyer (in PayPal) | The PayPal approval returns. |
| T-ORD-03 | Approved | Captured | System | PayPal capture COMPLETED (capture answer, webhook or scheduled read). |
| T-ORD-04 | Captured | Shipped | Seller | Tracking saved and accepted by PayPal. |
| T-ORD-05 | Captured, Shipped | Refunded | System | PayPal refund COMPLETED for the full amount. |
| T-ORD-06 | Created, Approved | Cancelled | System | 3 hours with no capture, or PayPal says VOIDED. |
| T-ORD-07 | Captured, Shipped | Partly refunded | System | A refund COMPLETED for less than the remaining amount. (Proposed; R1 refunds are full only.) |

### SM-RFD Refund request

| ID | From | To | By | Condition |
| --- | --- | --- | --- | --- |
| T-RFD-01 | (none) | Pending | Buyer | Order is Captured or Shipped, and no Pending request exists (INV-06). |
| T-RFD-02 | Pending | Approved | Seller | Two taps in the Seller app (INV-05). |
| T-RFD-03 | Pending | Declined | Seller | With a reason. |
| T-RFD-04 | Approved | Done | System | PayPal refund COMPLETED. |
| T-RFD-05 | Approved | Failed | System | PayPal refused the refund. The seller sees the reason. |

## Invariants

> **What this is.** Rules that hold at all times, whatever the flow.
>
> **Why it comes here.** Tests check invariants directly. A transition that breaks one is refused.
>
> **Shelf example.** INV-01: if a buyer sends `"price": 1` in a cart, the server ignores it and uses the stored price.
>
> **What it produces.** INV-01 to INV-10.

| ID | Invariant | From |
| --- | --- | --- |
| INV-01 | Every amount comes from stored variant prices and the store's shipping rule. No amount from a request is used. | SYS-PAY-01 |
| INV-02 | One cart holds variants of one store only. | PR-BUY-03 |
| INV-03 | A Published product has a confirmed price on every variant. | SYS-AI-02 |
| INV-04 | One Order has at most one Capture in R1. | SYS-PAY-03 |
| INV-05 | Only a Seller action moves a Refund request to Approved. No tool, agent, model or scheduled job does. | SYS-PAY-06 |
| INV-06 | An Order has at most one Pending refund request. | PR-BUY-06 |
| INV-07 | The sum of refunds of an Order never exceeds its captured amount. | SYS-PAY-07 |
| INV-08 | A Webhook event with a known PayPal event ID changes nothing. | SYS-PAY-04 |
| INV-09 | Each state transition of an Order or a Refund request writes one Event. | NFR-OPS-02 |
| INV-10 | A seller reads and changes only their own store's data. A refused read answers not found. | SYS-SEL-02 |

## Authority matrix

> **What this is.** Who may do each action.
>
> **Why it comes here.** Gate 3 threats and Gate 5 routes check against this table.
>
> **Shelf example.** A buyer may read an order only with its order token. An agent may never read an order through the MCP tools without one.
>
> **What it produces.** The matrix.

| Action | Seller (own store) | Buyer (with order token) | Agent (store key) | Model in a host | System |
| --- | --- | --- | --- | --- | --- |
| Upload photo, edit, publish | Yes | No | No | No | No |
| Search published products | Yes | Yes | Yes | Yes (tool) | — |
| Create or replace a cart | No | Yes | Yes | Yes (tool) | — |
| Start checkout | No | Yes | Yes | Yes (tool); the buyer still approves in PayPal | — |
| Capture | No | No | Yes (Cart API checkout after approval) | No | Yes |
| Read an order | Yes | Yes | Own carts only | Yes, with the order token from its own tool result | Yes |
| Request a refund | No | Yes | No | Yes (tool), creates Pending only | No |
| Approve or decline a refund | Yes | No | No | No | No |
| Add tracking | Yes | No | No | No | No |

## The principle to remember

One word per thing, one machine per thing that changes, and only the seller can say yes to giving money back.
