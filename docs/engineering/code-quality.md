# Code quality rules

> **What this is.** The rules every line of Shelf code follows, beyond the contracts. Rule CQ-01 bans implicit state machines. CQ-02 to CQ-20 come from Emil Kowalski's design-engineering skills (github.com/emilkowalski/skills, read 10 Nov 2026). CQ-21 to CQ-34 are the backend and API rules: they come from Brandur Leach's writing on Stripe-style API design (brandur.org/idempotency-keys; stripe.com/blog/idempotency) and Alexis King's "Parse, don't validate" (lexi-lambda.github.io, 2019), turned into checks for this codebase.
>
> **Why it comes here.** The contracts say what to build. These rules say how the code must look, so two agents write the same kind of code and a reviewer can reject a pull request with a rule ID.
>
> **Shelf example.** The Storefront checkout view must not hold `isPaying`, `isPaid` and `hasError` as three booleans. It holds one `state` field with the values of Gate 2, and one transition table decides every change.
>
> **What it produces.** CQ-01 to CQ-34, each one testable by reading the code.

## State

> **What this is.** How code holds and changes state.
>
> **Why it comes here.** Shelf moves money. An order that is "Paid and Cancelled" at once is a bug that costs a buyer money. Explicit machines make that state impossible to write.
>
> **Shelf example.** `type OrderState = "created" | "approved" | "captured" | "shipped" | "refunded" | "cancelled"`, and `ORDER_TRANSITIONS` lists the only allowed moves, with the Gate 2 IDs T-ORD-01 to T-ORD-07.
>
> **What it produces.** CQ-01 to CQ-06.

| ID | Rule | Good | Bad |
| --- | --- | --- | --- |
| CQ-01 | **No implicit state machines.** If a thing has more than two states, it has one `state` field typed as a union of string literals, and one transition table. Never encode a state as a mix of booleans, nullable fields or timestamps. | `state: "checking_out"` | `isLoading && !error && !paidAt` |
| CQ-02 | Every machine of Gate 2 (SM-PRD, SM-CRT, SM-ORD, SM-RFD) lives in `src/server/domain/` as a `const` transition table typed `Record<State, readonly State[]>`, plus one `transition(from, to, actor)` function. A move that is not in the table throws. Each entry names its Gate 2 transition ID in a comment. | `transition(order, "captured", "paypal") // T-ORD-03` | `order.state = "captured"` in a route handler |
| CQ-03 | A UI flow with more than two steps (checkout, photo reading, refund decision, sign-in) uses a discriminated union and `useReducer`, not several `useState` calls. Data a state needs lives inside that state's variant. | `{ kind: "waiting", orderId, since }` | `const [orderId, setOrderId] = useState()` beside `const [waiting, setWaiting] = useState(false)` |
| CQ-04 | Derive, do not store. A value that can be computed from the state or the server answer is computed in render. | `const canPay = cart.state === "ready"` | `const [canPay, setCanPay] = useState(false)` kept in sync by an effect |
| CQ-05 | Every `switch` over a state union ends with an exhaustive check (`const unreachable: never = state`), so a new state fails the type check everywhere it is not handled. | `default: return assertNever(state)` | `default: return null` |
| CQ-06 | A flag that never renders (an animation gate, an in-flight request guard) is a `useRef`, not state, so it does not re-render on every change. | `const inFlight = useRef(false)` | `const [inFlight, setInFlight] = useState(false)` |

## Components and libraries

> **What this is.** Which libraries to use for common UI jobs, and which to never hand-build.
>
> **Why it comes here.** A hand-built dialog misses focus traps and dismissal. A known library has fixed those bugs already.
>
> **Shelf example.** The refund confirmation sheet uses base-ui's Dialog, so focus stays inside it and Escape closes it.
>
> **What it produces.** CQ-07 to CQ-11.

| ID | Rule |
| --- | --- |
| CQ-07 | Dialogs, popovers, menus and selects use base-ui. Never a `div` with manual focus handling. |
| CQ-08 | Toasts use Sonner. Never a hand-built toast or a modal used as a toast. |
| CQ-09 | Conditional class names use `clsx`. A component with real variants (Button: primary, secondary, quiet) uses `cva` with a typed variant API. No template-literal ternaries nested more than one deep. |
| CQ-10 | Simple hover and fade use CSS transitions. Use `motion` only for springs, layout animation, exit animation or gestures (the Seller app bottom sheet). |
| CQ-11 | State shared across distant components uses one small zustand store per concern. Never a chain of props more than two levels deep for shared state. |

## Motion and rendering

> **What this is.** Rules that keep motion smooth and the UI stable.
>
> **Why it comes here.** The design system (`docs/design/DESIGN-SYSTEM.md`, "Motion") fixes durations and curves. These rules fix how the code applies them.
>
> **Shelf example.** The bottom sheet drag writes `transform` to `ref.current.style` on each pointer move. It never sets React state per frame.
>
> **What it produces.** CQ-12 to CQ-15.

| ID | Rule |
| --- | --- |
| CQ-12 | Animate only `transform` and `opacity`. Never `width`, `height`, `top` or `left`. |
| CQ-13 | Never `transition: all`. List the exact properties. |
| CQ-14 | A value that changes every frame (drag position, scroll progress) is written to `ref.current.style`, never to React state. |
| CQ-15 | Enter animations use `@starting-style` in CSS, not a `mounted` flag set in `useEffect`. Every animation stops under `prefers-reduced-motion` (keep fades, remove movement). |

## Data on screen

> **What this is.** Rules for showing real, untidy data without breaking the layout.
>
> **Why it comes here.** Sellers write long titles, buyers have long emails, and prices must never be cut off. These are the failure signatures of Emil's `break-ui` skill.
>
> **Shelf example.** A product titled "Hand-thrown speckled stoneware mug with a wide handle, large" clamps at two lines on the card and shows in full on the product view.
>
> **What it produces.** CQ-16 to CQ-20.

| ID | Rule |
| --- | --- |
| CQ-16 | Format money with one `formatMoney(cents)` built on `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`. Format counts with `Intl.PluralRules`. Never render a raw number, `NaN` or `undefined`. |
| CQ-17 | Never truncate a price, a total, a date or an order ID. Clamp card titles at two lines (`line-clamp: 2`). Wrap titles in a detail view. Truncate secondary text at the end only with a way to see the full value. |
| CQ-18 | Every flex or grid child that holds text has `min-width: 0`. Every fixed-size box (photo, icon, status dot) has `flex-shrink: 0`. Emails and URLs use `overflow-wrap: anywhere`. |
| CQ-19 | Escape user and model text once, at render. Never `dangerouslySetInnerHTML` with seller, buyer or model text. |
| CQ-20 | Every list view has a worst-case fixture in `tests/fixtures/worst/` (empty, one, many, the longest title the schema allows, a sold-out variant, a 6-variant product). Component tests and the E2E run render it. The fixture enters through the same boundary as real data; never edit markup to make a break. |

## Backend and API: data at the boundary

> **What this is.** How data enters the server and how it moves inside it. Source: Alexis King, "Parse, don't validate".
>
> **Why it comes here.** Every input to Shelf comes from someone who can be wrong: a buyer, an agent, a model, PayPal, the database. If a check returns `true` and the code then trusts the raw value, the next file forgets the check.
>
> **Shelf example.** `parseCartInput(body)` returns `CartInput` or a `request.invalid` error. After that line, no code sees `unknown`, and a quantity of 0 cannot exist.
>
> **What it produces.** CQ-21 to CQ-26.

| ID | Rule | Good | Bad |
| --- | --- | --- | --- |
| CQ-21 | **Parse, don't validate.** Every input is parsed once, at the boundary, into a domain type: HTTP bodies, MCP tool arguments, webhook bodies, PayPal answers, model answers and JSON columns read from D1. Inside the boundary, no code receives `unknown`, `any` or a raw `Request`. | `const input = parseCartInput(await request.json())` | `if (isValid(body)) priceCart(body as any)` |
| CQ-22 | **Branded types for IDs and money.** `Cents`, `OrderId`, `CartId`, `StoreId`, `PayPalOrderId` are branded, made only by a parser or a constructor. A function that takes `Cents` cannot receive dollars or a quantity. | `function refund(amount: Cents)` | `function refund(amount: number)` |
| CQ-23 | **Make illegal states unrepresentable.** A type allows only valid combinations. An order in `captured` has a `captureId`; an order in `created` has none. Use discriminated unions for records whose fields depend on state. | `{ state: "captured"; captureId: CaptureId }` | `{ state: string; captureId?: string }` |
| CQ-24 | **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. No `any`, no `as` casts outside parsers, no non-null `!`. | — | `order!.captureId as string` |
| CQ-25 | **Errors are values in the domain.** Domain functions return `Result<T, DomainError>` where `DomainError.code` is a Gate 5 error code. `throw` is only for programmer bugs. One function maps a code to an HTTP status and screen text (`api/error-codes.yaml`). | `return err("cart.other_store")` | `throw new Error("bad cart")` in a domain function |
| CQ-26 | **I/O lives at the edges.** `src/server/domain/` never calls `fetch`, `Date.now`, `crypto.randomUUID` or D1. The caller passes a clock and an ID generator, so tests are exact and repeatable. | `priceCart(input, store, { now })` | `new Date()` inside `priceCart` |

## Backend and API: money and foreign calls

> **What this is.** How the server talks to PayPal and Vertex without losing or doubling money. Source: Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" and Stripe's "Designing robust and predictable APIs with idempotency".
>
> **Why it comes here.** A network call can fail after the other side acted. Without an idempotency key and a recovery point, a retry charges twice or a crash leaves an order paid in PayPal and unpaid in Shelf.
>
> **Shelf example.** Before the capture call, Shelf already knows the request ID (`capture:{orderId}`). If the Worker dies after PayPal captured, the reconciler (SYS-PAY-09) reads PayPal and finishes the order; a retry with the same ID captures nothing new.
>
> **What it produces.** CQ-27 to CQ-31.

| ID | Rule |
| --- | --- |
| CQ-27 | **Idempotency keys on every mutating foreign call.** Every PayPal create, capture, refund and tracking call sends `PayPal-Request-Id` derived from Shelf's own record (`order:{cartId}:{version}`, `capture:{orderId}`, `refund:{refundRequestId}`). Never a random value: a retry must send the same key. |
| CQ-28 | **Atomic phases around foreign calls.** A request that calls PayPal runs in phases: read and decide; call PayPal; write the result and its Event in one `DB.batch`. Never hold a half-written state across the call. Every phase can be run again safely, and the reconciler can finish any request that stopped between phases. |
| CQ-29 | **Timeouts and bounded retries.** Every outbound call has a timeout (10 s). Retry only transient failures (network error, 429, 5xx), at most twice, with backoff and the same idempotency key. Never retry a 4xx. |
| CQ-30 | **The server owns the truth.** Totals, prices, states and permissions are computed on the server. A client, an agent or a model only proposes; the server decides (INV-01, INV-05). |
| CQ-31 | **Webhooks are hints, not commands.** A verified webhook triggers a read of the current state from PayPal or a state transition that the table allows; it never sets a state directly, and a duplicate does nothing. |

## Backend and API: interface and operation

> **What this is.** How the API looks from outside and how the server reports what it did.
>
> **Why it comes here.** Agents and judges read the API without the code. A stable, boring API is easier to trust.
>
> **Shelf example.** Every error answers `{ "error": { "code": "cart.other_store", "message": "One cart holds one store. Start a new cart?" } }`, the same in the Cart API, the Seller app API and the MCP tool error text.
>
> **What it produces.** CQ-32 to CQ-34.

| ID | Rule |
| --- | --- |
| CQ-32 | **Stable error codes.** Error codes are dotted, lower-case and never renamed (`api/error-codes.yaml`). Never return a stack trace or an upstream message to a client; log it with the trace ID instead. A forbidden read answers 404 (INV-10). |
| CQ-33 | **One structured log line per request.** JSON with `traceId`, `route`, `actor`, `outcome` (error code or `ok`), `durationMs` and the IDs touched. Never an email, an address, a token, a photo or a prompt (NFR-SEC-03). |
| CQ-34 | **Test the machine, not the path.** Every transition table is tested for every allowed move and a sample of refused moves. Every PayPal path has a contract test against a recorded sandbox answer, and the recordings carry no secrets. |

## How a reviewer uses this

1. Read the diff with this table open.
2. Reject with the rule ID: "CQ-01: `isPaid` and `isPending` encode the order state; use `OrderState`."
3. A rule that blocks a task needs a contract change request (`AGENTS.md`), not a quiet exception.

## The principle to remember

One field holds a state, one table moves it, every input is parsed once at the edge, every money call can be repeated safely, and the screen survives the strangest data the schema allows.
