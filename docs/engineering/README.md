# Engineering contracts · conventions

> **What this is.** The rules that the seven Shelf engineering contracts follow: the gate order, the format, the IDs and where decisions live.
>
> **Why it comes here.** The contracts turn the product documents into a system that coding agents can build without guessing. Without shared rules, each contract would invent its own layout.
>
> **Shelf example.** Flow FL-BUY-03 (Gate 1) names SYS-PAY-04. Gate 5 gives the webhook route for it. Gate 6 gives test TC-PAY-04. Task T-02 in `tasks.yaml` builds it and must make TC-PAY-04 pass.
>
> **What it produces.** The gate table, the learning format, the ID rules and the decision rules.

The requirements live in `docs/product/` (Concept, PRD, SyRS). The business requirements (BRD) are private; the IDs it defines (BO, C, R, B) are quoted where a public document needs them. Where a contract and a product document differ, the product document wins: stop and file a contract change request (`AGENTS.md`).

## The gates

| Gate | Contract | File | Status |
| --- | --- | --- | --- |
| 1 | Product contract: flows, acceptance criteria, failure cases | [01-product-contract.md](01-product-contract.md) | Proposed, 10 Nov 2026 |
| 2 | Domain contract: glossary, entities, state machines, invariants, who may do what | [02-domain-contract.md](02-domain-contract.md) | Proposed, 10 Nov 2026 |
| 3 | Architecture contract with the threat model | [03-architecture-contract.md](03-architecture-contract.md), [adr/](adr/) | Proposed, 10 Nov 2026 |
| 4 | Data contract: tables, constraints, migrations | [04-data-contract.md](04-data-contract.md), `db/` | Proposed, 10 Nov 2026 |
| 5 | Interface contract: routes, MCP tools, Cart API, webhooks, errors | [05-interface-contract.md](05-interface-contract.md), `api/` | Proposed, 10 Nov 2026 |
| 6 | Quality contract: spikes, tests, checks, deploy and rollback | [06-quality-contract.md](06-quality-contract.md) | Proposed, 10 Nov 2026 |
| 7 | Implementation contract: tasks, order, done rules | [07-implementation-contract.md](07-implementation-contract.md), [tasks.yaml](tasks.yaml) | Proposed, 10 Nov 2026 |

Founder decisions are kept private. Setup that only a person can do (accounts, secrets) is in [deferred-setup.md](deferred-setup.md).

## The learning format

Every major section (`##`) opens with a four-part box, in this order: **What this is**, **Why it comes here**, **Shelf example**, **What it produces**. Then comes the detail. Every contract ends with **The principle to remember**: one sentence a reader keeps after forgetting the detail.

Writing follows Simplified Technical English in the spirit of ASD-STE100: short sentences, one idea per sentence, active voice, the actor as the subject, one term per concept (the Gate 2 glossary), the condition before the result.

## IDs

| Prefix | Meaning | Defined in |
| --- | --- | --- |
| BO, C, R, B | Business objective, constraint, risk, blocker | The private BRD; constraints C-1 to C-6 are restated in `03-SyRS.md` as CON-01 to CON-06 |
| PR, XR | Product requirement, experience rule | `02-PRD.md` |
| SYS, NFR, CON | System requirement, non-functional requirement, constraint | `03-SyRS.md` |
| FL, AC, FC | Flow, acceptance criterion, failure case | Gate 1 |
| T-xxx (state), INV | State transition, invariant | Gate 2 |
| ADR, THR | Architecture decision, threat | Gate 3 |
| TAB | Table | Gate 4 |
| ERR | Error code | Gate 5 |
| SPK, TC | Spike, test case | Gate 6 |
| T-nn | Build task | Gate 7, `tasks.yaml` |

IDs are never renumbered. A new item takes the next free number.

## Where decisions live

| Kind | Where |
| --- | --- |
| Product decision only a founder can make | Ask a founder. Work goes on with the answer the contracts already give. |
| Domain choice (an entity, a state, a rule) | Gate 2, marked "(proposed)" until confirmed. |
| Architecture decision | `adr/NNN-title.md`: context, options, decision, consequences. A replaced ADR stays, with status "Superseded by NNN". |

## The principle to remember

Each gate stands on the one before it, and every ID points to its source and its test.
