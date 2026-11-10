# Code quality rules

> **What this is.** The rules every line of Shelf code follows, beyond the contracts. Rule CQ-01 bans implicit state machines. The other rules come from Emil Kowalski's design-engineering skills (github.com/emilkowalski/skills, read 10 Nov 2026), turned into checks for this codebase.
>
> **Why it comes here.** The contracts say what to build. These rules say how the code must look, so two agents write the same kind of code and a reviewer can reject a pull request with a rule ID.
>
> **Shelf example.** The Storefront checkout view must not hold `isPaying`, `isPaid` and `hasError` as three booleans. It holds one `state` field with the values of Gate 2, and one transition table decides every change.
>
> **What it produces.** CQ-01 to CQ-20, each one testable by reading the code.

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

## How a reviewer uses this

1. Read the diff with this table open.
2. Reject with the rule ID: "CQ-01: `isPaid` and `isPending` encode the order state; use `OrderState`."
3. A rule that blocks a task needs a contract change request (`AGENTS.md`), not a quiet exception.

## The principle to remember

One field holds a state, one table moves it, and the screen survives the longest, emptiest and strangest data the schema allows.
