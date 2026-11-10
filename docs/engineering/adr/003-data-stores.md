# ADR-003 · D1 for records, R2 for photos, Queues for extraction, Cron for reconciling

**Status.** Proposed, 10 Nov 2026.

**In one line.** All records live in one D1 database `shelf` through Drizzle. Photos live in R2 `shelf-photos`. A Queue `extraction` runs photo reading. A cron every 5 minutes reconciles orders and expires carts.

## Context
- R1 volume is small: a few stores, tens of orders.
- Carts change rarely and by one buyer, so there is little contention.
- Photo reading takes seconds and can fail; it needs retries outside the request.

## Options
| | D1 (chosen) | Hyperdrive + Postgres | Durable Objects per cart |
| --- | --- | --- | --- |
| Setup | Binding only | External database | Class per object |
| Transactions | `batch` (atomic) | Full | Per object |
| Fit for R1 | Good | More moving parts | Not needed |

## Decision
1. D1 database `shelf`, binding `DB`. Migrations in `db/migrations/` applied with `wrangler d1 migrations apply`.
2. Multi-row writes use `DB.batch([...])` so they commit together (D1 runs a batch as one transaction).
3. Concurrency on carts and orders uses a `version` column: an update includes `WHERE version = ?` and fails if it changed.
4. R2 bucket `shelf-photos`, binding `PHOTOS`. Photos are read through `/photos/[key]` with a signed, expiring query.
5. Queue `extraction`, binding `EXTRACTION_QUEUE`, `max_retries: 3`, a dead-letter queue `extraction-failed`.
6. Cron `*/5 * * * *`.

## Consequences
- D1 has no row locks. Optimistic `version` checks and unique constraints carry the invariants.
