# Gate 7 · Implementation contract

> **What this is.** How the build runs: the milestones, the task graph, the critical path, the definition of done and the rules for agents.
>
> **Why it comes here.** It is the last gate. It turns Gates 1 to 6 into ordered work that coding agents can pick up and finish without asking.
>
> **Shelf example.** Task T-10 builds `start_checkout` and the Pay page. It may start only when T-06 (the Pay page spike) and T-09 (the cart tools) are done. It is done when TC-PAY-01, TC-PAY-03 and TC-SEC-02 pass.
>
> **What it produces.** The milestone plan, the critical path, the parallel lanes, the definition of done, the cut order and the commit rules. The tasks themselves are in `tasks.yaml`.

## Milestones

> **What this is.** Five milestones with an end time each, in IST.
>
> **Why it comes here.** The deadline is fixed (C-1). An end time per milestone shows early when the plan slips.
>
> **Shelf example.** If M1 is not done by 11 Nov 20:00 IST, the cut order below starts.
>
> **What it produces.** The milestone table.

| Milestone | Goal | Ends (IST) | Flows completed |
| --- | --- | --- | --- |
| M0 | Foundations and spikes SPK-01 to SPK-07 | 11 Nov 09:00 | — |
| M1 | Buyer path end to end in Claude | 11 Nov 20:00 | FL-BUY-01 to FL-BUY-05 |
| M2 | Seller app | 12 Nov 02:00 | FL-SEL-01 to FL-SEL-05 |
| M3 | Cart API, Try page, seed, landing | 12 Nov 13:00 | FL-AGT-01, FL-JDG-01 |
| M4 | CI, checks, README, video, submit | 12 Nov 22:00 | — |

## The plan in numbers

> **What this is.** The size of the work and its longest chain.
>
> **Why it comes here.** It shows whether the plan can fit, before anyone starts.
>
> **Shelf example.** 29 tasks, about 53 hours of work. The longest chain is about 19.5 hours. The window from 10 Nov 21:00 to 12 Nov 22:00 IST is 49 hours.
>
> **What it produces.** The numbers and what they mean.

The longest chain is T-01 → T-02 → T-08 → T-09 → T-10 → T-11 → T-18 → T-19 → T-26 → T-27 → T-28 (about 19.5 hours). The total is about 53 hours. Two founders with coding agents can fit it only if the two lanes below run in parallel and the founders sleep in turns. The estimates are judgments. If M1 ends more than 3 hours late, use the cut order.

## Parallel lanes

> **What this is.** Which tasks each founder (and their agents) takes.
>
> **Why it comes here.** Two people on one file waste hours. Lanes give each person their own files.
>
> **Shelf example.** Founder A owns `src/server/**`. Founder B owns `storefront/**`, `src/app/app/**` and `src/components/**`.
>
> **What it produces.** The lane table.

| Lane | Role | Tasks in order |
| --- | --- | --- |
| A | Payments | T-01, T-02, T-03, T-04, T-05, T-06, T-08, T-09, T-10, T-11, T-12, T-14, T-16, T-21, T-25 |
| B | Frontend | T-07, T-29, T-13, T-15, T-17, T-18, T-19, T-20, T-22, T-24, T-26 |
| Both | Lead | T-23, T-27, T-28 |

## Definition of done

> **What this is.** The rules a task must meet before it counts as done.
>
> **Why it comes here.** "It compiles" is not evidence. An agent needs a test it can run.
>
> **Shelf example.** T-11 is not done when the webhook route answers 200. It is done when TC-PAY-04 and TC-PAY-09 pass in CI.
>
> **What it produces.** DoD-01 to DoD-06.

| ID | Rule |
| --- | --- |
| DoD-01 | Every test ID in the task's `tests` exists in code with the ID in the test name, and passes. No skip. |
| DoD-02 | Only the files in `touches` changed, plus generated output and the lockfile. |
| DoD-03 | Names use the Gate 2 glossary. No word from its "Not" column. |
| DoD-04 | The task's `done` sentence is true, and spike tasks have an evidence file. |
| DoD-05 | CI is green. |
| DoD-06 | A contract that the task found wrong has a change request (`AGENTS.md`). |

## Cut order

> **What this is.** What we drop, in order, if time runs out.
>
> **Why it comes here.** A plan with no cut order fails all at once. This one fails one feature at a time.
>
> **Shelf example.** If it is 12 Nov 14:00 IST and T-22 (Try page chat) is not done, ship the Try page with the search box fallback (ADR-010).
>
> **What it produces.** The cut list.

1. T-20 Web Push. The Seller app polls every 5 s instead.
2. PayPal Catalog Products sync (Should in ADR-004).
3. The Gemini chat in the Try page. Use the search box fallback.
4. ChatGPT on video. Show Claude only, and say so in the README.
5. Log in with PayPal. Use the "Demo seller" sign-in for the seeded stores (ADR-008).
6. Never cut: server totals, webhook verification, seller-approved refunds, the README "verified and not verified" table.

## Commit and pull request rules

> **What this is.** How work is recorded.
>
> **Why it comes here.** Judges may read the history. A clean history also lets us roll back one task.
>
> **Shelf example.** `T-10: Add start_checkout and the Pay page`.
>
> **What it produces.** The rules.

- One pull request per task. Title `T-nn: <verb> <object>`, 72 characters or fewer, imperative.
- The body says why in short sentences and lists the test IDs that now pass.
- Squash merge to `main`. `main` deploys to the sandbox Worker.

## The principle to remember

The longest chain sets the date, so spikes go first, lanes run in parallel, and the cut order is decided before it is needed.
