# Gate 4 · Data contract

> **What this is.** The tables, the constraints, how writes stay consistent, the data rules and the migration rules for D1.
>
> **Why it comes here.** Gates 2 and 3 fixed the entities and the store (D1, ADR-003). This gate makes each entity a table and each invariant a constraint where SQL can hold it.
>
> **Shelf example.** INV-06 (one pending refund request per order) is a partial unique index: `refund_one_pending`. Two quick taps by Ben make one request; the second insert fails and the tool returns the first request.
>
> **What it produces.** The table list, the invariant-to-constraint map, the write rules, the data rules and the migration rules. The SQL is in `db/migrations/0001_initial.sql`.

## Tables

> **What this is.** Each table, the entity it holds and its key columns.
>
> **Why it comes here.** Tasks and queries name tables by these IDs.
>
> **Shelf example.** TAB-09 `orders` holds `paypal_order_id` and `capture_id`, both unique.
>
> **What it produces.** TAB-01 to TAB-14.

| ID | Table | Entity | Notes |
| --- | --- | --- | --- |
| TAB-01 | `sellers` | Seller | `paypal_account_id` unique. |
| TAB-02 | `sessions` | Seller session | Cookie holds `sessions.id`. 7-day expiry. |
| TAB-03 | `stores` | Store | One per seller (unique `seller_id`). USD only. |
| TAB-04 | `store_keys` | Store key | SHA-256 hash only. |
| TAB-05 | `photos` | Photo | States `queued`, `extracted`, `failed`, `no_product`. |
| TAB-06 | `products` | Product | States `draft`, `published`, `deleted`. `ai_fields_json` lists model fields. |
| TAB-07 | `variants` | Variant | `price_cents` null until confirmed. |
| TAB-08 | `carts` | Cart | `version` for optimistic concurrency. `lines_json` is server-computed. |
| TAB-09 | `orders` | Order | `capture_id` unique; `refunded_cents <= amount_cents`. |
| TAB-10 | `refund_requests` | Refund request | Partial unique index on pending. |
| TAB-11 | `events` | Event | Append only. |
| TAB-12 | `webhook_events` | Webhook event | Primary key is the PayPal event ID. |
| TAB-13 | `push_subscriptions` | Push subscription | One per device endpoint. |
| TAB-14 | `rate_limits` | — | Fixed-window counters. |

States are stored in lower case in tables (`captured`); the glossary and the UI use the capitalised words (Captured).

## Invariants in the database

> **What this is.** Which Gate 2 invariants the database enforces, and which the code enforces.
>
> **Why it comes here.** A constraint holds even if the code has a bug. The code must enforce the rest, and tests must cover them.
>
> **Shelf example.** INV-07 is a CHECK on `orders.refunded_cents`. INV-05 cannot be a constraint, so the code and TC-SEC-03 carry it.
>
> **What it produces.** The map.

| Invariant | Database | Code | Test |
| --- | --- | --- | --- |
| INV-01 server totals | `lines_json`, `total_cents` written by the server only | `domain/cart.ts` `priceCart` | TC-PAY-02 |
| INV-02 one store per cart | `carts.store_id` | `priceCart` refuses variants of another store | TC-CART-04 |
| INV-03 confirmed prices | `variants.price_cents` null until set | `publishProduct` checks every variant | TC-AI-02 |
| INV-04 one capture | `orders.capture_id` unique | `PayPal-Request-Id` on capture | TC-PAY-03 |
| INV-05 seller approves refunds | — | Only `/api/seller/refunds/{id}/approve` sets `approved` | TC-SEC-03 |
| INV-06 one pending request | `refund_one_pending` partial unique index | `requestRefund` returns the existing one | TC-MCP-05 |
| INV-07 refunds not above capture | CHECK on `orders.refunded_cents` | `approveRefund` computes the remaining amount | TC-PAY-06 |
| INV-08 webhook once | `webhook_events` primary key | Insert before apply, in one batch | TC-PAY-04 |
| INV-09 one event per transition | — | `transition()` adds the event to the same batch | TC-PAY-04 |
| INV-10 own store only | — | `requireStore(session)` on every seller route | TC-SEC-01 |

## Write rules

> **What this is.** How a write stays consistent when D1 has no row locks.
>
> **Why it comes here.** Two requests can race: the Pay page capture and the webhook arrive within a second.
>
> **Shelf example.** The capture answer sets the order to Captured with `WHERE version = 3`. The webhook comes next, reads version 4, sees Captured, and only records its event ID.
>
> **What it produces.** W-01 to W-05.

| ID | Rule |
| --- | --- |
| W-01 | Every state change runs `UPDATE … SET state = ?, version = version + 1 WHERE id = ? AND version = ?`. If no row changed, read again and decide again. Never overwrite. |
| W-02 | A state change and its Event go in one `DB.batch`, so both commit or neither does. |
| W-03 | A webhook inserts its event ID and applies its change in one `DB.batch`. If the insert fails as a duplicate, the batch fails and nothing changes. |
| W-04 | No PayPal call runs inside a batch. Read or call PayPal first, then write. |
| W-05 | IDs are a prefix plus a ULID (`ord_01J…`), so they sort by time. Cart IDs are `CART-` plus 12 upper-case letters and digits. |

## Seed data

> **What this is.** The rule for data that is not created by a real seller.
>
> **Why it comes here.** The founders decided on 11 Nov 2026: no mock data. A judge must never see an invented store as if it were real.
>
> **Shelf example.** The Try page shows only stores that real sellers created through the Seller app. If none exist yet, search answers "No products match yet."
>
> **What it produces.** The data rules.

1. No seed runs against `local` for the app, `sandbox` or `production`. There is no `db/seed.sql`.
2. Invented stores and products for automated tests live in `tests/fixtures/catalog.sql` and are loaded only by `tests/support/d1.ts`.
3. The first real stores are created by the founders as real sellers: they sign in with PayPal (sandbox business accounts), photograph their own items and confirm prices (task T-23).
4. `stores.is_demo` stays 0. It is kept only so the migration does not change.

## Migrations

> **What this is.** How the schema changes.
>
> **Why it comes here.** A changed table without a migration breaks the deployed Worker.
>
> **Shelf example.** Adding a column for partial refunds is `0002_partial_refunds.sql`, never an edit of `0001`.
>
> **What it produces.** M-01 to M-03.

| ID | Rule |
| --- | --- |
| M-01 | Migrations are numbered SQL files in `db/migrations/`. A merged migration is never edited. |
| M-02 | The Drizzle schema in `src/server/db/schema.ts` matches the SQL. A check runs `drizzle-kit check` in CI. |
| M-03 | Apply with `wrangler d1 migrations apply shelf --remote` before deploying the Worker that needs it. |

## The principle to remember

The database holds every invariant it can, and every other invariant has a named function and a named test.
