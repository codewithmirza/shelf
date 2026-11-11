# AGENTS.md

Read this before you change anything in this repository.

## The source of truth

What Shelf is and what it must do live in `docs/product/`: [Concept](docs/product/00-concept.md), [PRD](docs/product/02-PRD.md), [SyRS](docs/product/03-SyRS.md). The seven engineering contracts in `docs/engineering/` turn them into a system you can build without guessing. Where a contract and a product document differ, the product document wins: stop and file a contract change request.

## Read in this order

1. Your task in `docs/engineering/tasks.yaml`, and the sections in its `reads_first`.
2. `docs/engineering/02-domain-contract.md`, "Glossary". It is the dictionary of this repository.
3. The Gate 1 flows and acceptance criteria your task names (`01-product-contract.md`).
4. The Gate 6 test IDs of your task (`06-quality-contract.md`, "Test catalogue").
5. For a UI task: the Figma file "Shelf · Design system and app screens" (fileKey `07OeRO9BvPAmfQoeT44L6N`, https://www.figma.com/design/07OeRO9BvPAmfQoeT44L6N), `docs/design/DESIGN-SYSTEM.md` and `docs/design/BRAND.md`. Screen IDs (S1 to S12, P1 to P4, A1 to A13, T1, T2, L1, L2) and flows F1 to F5 in Figma match the Gate 1 flows.

| Need | Read |
| --- | --- |
| How code must look: state, libraries, motion, data on screen | `docs/engineering/code-quality.md` |
| What "done" means for a flow | Gate 1, `01-product-contract.md` |
| Words, states, invariants, who may do what | Gate 2, `02-domain-contract.md` |
| Containers, stack, threats, ADRs | Gate 3, `03-architecture-contract.md`, `adr/` |
| Tables, write rules, seed | Gate 4, `04-data-contract.md`, `db/` |
| MCP tools, routes, Cart API, errors | Gate 5, `05-interface-contract.md`, `api/` |
| Spikes, tests, CI, deploy, demo | Gate 6, `06-quality-contract.md` |
| Tasks, lanes, done, cut order | Gate 7, `07-implementation-contract.md`, `tasks.yaml` |
| A product decision the documents do not answer | Ask a founder; the business requirements and founder decisions are private |
| Accounts and secrets only a person sets | `docs/engineering/deferred-setup.md` |

## Hard rules

1. **One lockfile:** `pnpm-lock.yaml` at the root.
2. **Pinned versions:** `next 16.4.6`, `@opennextjs/cloudflare 1.20.16`, `agents 0.33.0`, `@modelcontextprotocol/server 2.4.0`, `@modelcontextprotocol/ext-apps 2.0.4`, `typescript 5.9` (Gate 3, "Stack"; ADR-011). Do not upgrade without an ADR.
3. **One PayPal caller:** only `src/server/paypal/` calls PayPal. **One model caller:** only `src/server/model/` calls Vertex.
4. **One cart implementation:** the MCP tools, the Cart API and the Try page call the same functions in `src/server/`.
5. **Server totals only:** never use an amount from a request (INV-01).
6. **No refund without the seller:** no tool, route, job or model moves a refund request to Approved, except `POST /api/seller/refunds/{id}/approve` (INV-05).
7. **Verify before you trust a webhook** (SYS-PAY-04).
8. **Generated files are never edited by hand:** `src/server/mcp/storefront.generated.ts`.
9. **The UI uses only the design system tokens.** No colour, size, radius or duration literal outside `tokens.css`.
10. **No secret in code, logs, tests or the Storefront.** Secrets come from Worker secrets only.
11. **No fake data shown as real.** Demo stores are marked as demo. Never claim an unmeasured number.
12. **No duplicate.** Search before you add a helper or a type.
13. **No implicit state machines.** Anything with more than two states has one `state` field typed as a union and one transition table; never a mix of booleans, nullable fields or timestamps (CQ-01).
14. **Follow the code quality rules** in `docs/engineering/code-quality.md` (CQ-01 to CQ-34): frontend rules from Emil Kowalski, backend and API rules from Brandur Leach and Alexis King. A reviewer rejects with the rule ID.
15. **Record progress.** After each step, update `docs/engineering/PROGRESS.md`, commit and push. Work can stop at any moment; the next agent resumes from that file.

## How you work on a task

**Pick.** Take a task whose `depends_on` are all done. Work on one task at a time. Touch only the files in `touches`.

**Prove done.** A task is done when DoD-01 to DoD-06 of Gate 7 hold. "It compiles" is not evidence.

**When a contract is missing something.** Never invent a term, a field, an error code, a state, a column or a route. Stop that part, and open a pull request titled `CCR-nnn: <gate>: <one line>` that adds `docs/engineering/ccr/CCR-nnn.md` with the exact change. A founder accepts or rejects it.

## Skills

| Work | Skill |
| --- | --- |
| A UI task | `design:design-system`, `design:accessibility-review`, `design:ux-copy` |
| A review of a pull request | `engineering:code-review` |
| A security question or a payment route | `engineering:code-review` with the threat model of Gate 3 |
| Documentation | `engineering:documentation` |

## Writing standard

Everything follows Simplified Technical English in the spirit of ASD-STE100: file names, identifiers, comments, commits and documents.

- One word for one meaning. The Gate 2 glossary is the dictionary.
- Names are words, not abbreviations: `refundRequest`, not `rr`. `camelCase` for TypeScript values, `PascalCase` for types, `snake_case` for SQL and file names under `src/server/`.
- Comments explain why a line exists and what breaks without it. They never repeat the code.
  - Good: `// Send the cart version as the request ID, so a retried create makes one PayPal order (SYS-PAY-03).`
  - Bad: `// create order`.
- Commits and pull requests: `T-nn: <verb> <object>`, imperative, 72 characters or fewer.
- State the condition before the result: "If the signature fails, change nothing."

## Standing constraints

- Never mark simulated work as real. If the model is not configured, the Seller app says "Photo reading is off".
- Never put an email, an address, a token or photo content in a log.
- Never send a buyer email or address to a model or an agent (IR-06).
