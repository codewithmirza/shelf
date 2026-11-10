# Shelf · Design system

> **What this is.** The tokens, components, patterns and motion rules that every Shelf screen uses. The values live in `tokens.css`.
>
> **Why it comes here.** The founder asked for UX right in one go. A system decided before the build means each screen is assembled, not invented.
>
> **Shelf example.** The cart total uses `Price` (Geist Mono, tabular numbers). When Ben changes a quantity, the digits change in place and nothing shifts.
>
> **What it produces.** Foundations, components, surface patterns, motion, accessibility and a review checklist.

Sources: `BRAND.md`; Emil Kowalski's standards (emil-design-eng, review-animations STANDARDS, ui-cheatsheet). Every rule here is testable by reading the code or the screen.

The founders keep a live reference of these components with previews in both themes. Product code is built from this file and `tokens.css`.

## Foundations

> **What this is.** Colour, type, space, radius and elevation.
>
> **Why it comes here.** Components are made of these. A literal value outside `tokens.css` is a defect (AGENTS.md rule 9).
>
> **Shelf example.** A card uses `--color-surface`, `--radius-card` and a 1 px `--color-line` border. No shadow.
>
> **What it produces.** The foundation rules.

**Colour.** Neutral surfaces with a slight warm grey. No brand accent. State colours (paid, wait, danger) only show state and always come with a word and an icon. Light and dark themes are both first-class; dark is not an inversion, it lowers surface contrast and lifts state colours.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-background` | #F7F7F5 | #0E0E0D | Page |
| `--color-surface` | #FFFFFF | #171716 | Cards, sheets, Storefront |
| `--color-ink` | #111110 | #F3F2EF | Text, primary button |
| `--color-ink-secondary` | #4A4946 | #B9B7B1 | Supporting text |
| `--color-ink-tertiary` | #6E6C67 | #8C8A84 | Meta (passes 4.5:1) |
| `--color-line` | #E6E5E1 | #262624 | Borders |
| `--color-paid` | #1F7A4C | #4CC08A | Paid, Live, Shipped |
| `--color-wait` | #9A5B0A | #E3A33B | Waiting, Refund requested, Suggested price |
| `--color-danger` | #B42318 | #F97066 | Errors, Declined |

**Type.** Geist (400, 500, 600) for the web app; Geist Mono for prices, order IDs, times and counts; the system font stack in the Storefront so it feels native inside each host. Scale: 12, 13, 15, 17, 20, 24, 32, 44. Sizes of 24 and up use `--tracking-display` (-0.02em). All numbers use `font-variant-numeric: tabular-nums`. Body lines stop at 65 characters. Headings use `text-wrap: balance`.

**Space.** A 4 px grid: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72. Groups use `gap`, not margins.

**Radius.** 6 px controls, 10 px cards and photos, 14 px sheets and the Storefront frame. Round only for the status dot and avatars.

**Elevation.** Flat by default; separation by a 1 px line. Shadows only for things that float: sheets (`--shadow-sheet`) and menus (`--shadow-pop`).

## Components

> **What this is.** The building blocks, with their states and rules.
>
> **Why it comes here.** Each screen in Gate 1 is built from these. Task T-29 builds them first.
>
> **Shelf example.** `Status` renders "Paid" as a green dot, a check icon and the word. Screen readers hear "Order status: Paid".
>
> **What it produces.** The component table and the rules for each.

| Component | Variants and states | Rules |
| --- | --- | --- |
| Button | primary (ink fill), secondary (line border), quiet (text). Default, hover, pressed, focus, disabled, busy. | Height 40 px (44 px touch area). Press: `scale(0.97)` over 140 ms ease-out. Label says the action and the amount for money: "Refund $32.00". Busy keeps the width and shows a 14 px spinner; never a layout jump. |
| PayPal button | PayPal JS SDK v6 button only | Never restyled, never recoloured, never covered. It is the only coloured control in checkout. |
| Field | text, number, money, textarea. Default, focus, error, suggested. | Label above, help or error below in 13 px. Error text says how to fix it. |
| Suggested mark | on any field the model filled | A dotted underline and the word "Suggested" in `--color-wait`. Editing the field removes the mark. |
| Price | regular, large, strike (old price) | Geist Mono, tabular. Always "$32.00". Never animate the digits. |
| Status | Draft, Live, Waiting, Paid, Shipped, Refund requested, Refunded, Declined, Failed | Dot + icon + word. Colour from the state table. Changes cross-fade over 180 ms. |
| Product card | default, pressed, sold out | Photo 4:5 with `--radius-card`, title (2 lines max), price, store name in 13 px. Whole card is one target. |
| Variant picker | segmented options | Each option is a 40 px button. Sold out options show the word "Sold out", not only a strike. |
| Quantity stepper | − value + | Value in Geist Mono. Limits 1 to 10. Holding a button does not repeat. |
| Cart line | default, issue | Title, options, quantity, line total. An issue shows its sentence under the line in `--color-wait`. |
| Sheet | bottom sheet on mobile, side panel above 768 px | Enters with `translateY(100%)` to 0 over 300 ms `--ease-drawer`. Drag down to close; a fast flick (velocity over 0.11 px/ms) closes it. |
| Toast | info, success, error | One at a time in the Seller app. Bottom on mobile. Enter 300 ms, exit 200 ms. Pauses when the tab is hidden. |
| Timeline | order events | Time in Geist Mono 12 px, actor in 13 px medium, text in 15 px. Newest at the bottom. |
| Photo tile | reading, ready, failed | Reading shows a thin linear progress bar (constant motion, linear easing), never a spinner over the photo. |
| Empty state | per list | One sentence and one action: "No products yet." with "Add photos". |

## Surface patterns

> **What this is.** How the four surfaces use the components.
>
> **Why it comes here.** Each surface has a different context: a phone, a chat frame, a browser tab, a judge's laptop.
>
> **Shelf example.** The Storefront has no header and no navigation. The host is the navigation; the Storefront shows one view at a time.
>
> **What it produces.** One pattern per surface.

**Storefront (inside Claude and ChatGPT).** Width follows the host (about 360 to 720 px). System font stack. One view per tool result: results (a row of up to 6 cards, scrolling sideways on narrow widths), product, cart, checkout, order. The primary action sits at the bottom of the view. A small footer line: mark + "Sold on Shelf · Payments by PayPal". The checkout view says "Finish in PayPal…" with the order total, and shows the "Open PayPal checkout" link if the host does not open it.

**The Paid moment.** The one place Shelf allows delight, because it happens once per order. When `get_order_status` returns Captured, the checkout card cross-fades to the order view: a 28 px check draws its stroke over 420 ms (`--ease-out`), the word "Paid" and the amount appear with a 40 ms stagger, and the host gets `ui/message` "Paid. Order {id}." Under reduced motion the check appears at once.

**Pay page.** One column, 480 px. Store name, lines, total in large Price, the PayPal button, and one line: "You approve in PayPal. Shelf never sees your card." After capture: the Paid moment and "You can go back to your chat."

**Seller app.** Mobile first, one column, 480 px on desktop. A bottom bar with three places: Products, Orders, Store. The main action floats above the bar: "Add photos" on Products. Orders show newest first with Status; a pending refund request pins to the top with its two buttons. Approve opens a confirm sheet: "Refund $32.00 to the buyer?" with "Refund $32.00" and "Cancel".

**Try page.** Two columns above 960 px: the chat on the left, the Storefront frame on the right. One column below, with the Storefront under the last message. A quiet bar at the top: "Sandbox. Use buyer {email} / {password}." with a copy button.

**Landing page.** The one sentence as the headline (44 px), a short real screen recording of the Paid moment in Claude, the Try page link, and the repository link. No feature grid, no testimonials, no invented numbers.

## Motion

> **What this is.** When things move, how fast, and with which curve.
>
> **Why it comes here.** Motion is felt more than seen. Wrong motion makes a fast app feel slow.
>
> **Shelf example.** The quantity stepper has no animation: Ben may tap it ten times. The bottom sheet animates: it opens a few times a session.
>
> **What it produces.** The motion table and rules.

| Element | Animate? | Duration | Curve |
| --- | --- | --- | --- |
| Button press | Yes, scale 0.97 | 140 ms | `--ease-out` |
| Hover (pointer devices only) | Colour only | 150 ms | `ease` |
| Status change | Cross-fade | 180 ms | `--ease-out` |
| Menu, select | Scale from 0.96 + fade, from the trigger | 220 ms | `--ease-out` |
| Sheet | translateY | 300 ms enter, 200 ms exit | `--ease-drawer` |
| Toast | translateY + fade | 300 ms enter, 200 ms exit | `--ease-out` |
| First search results | Fade + 8 px rise, 40 ms stagger | 220 ms | `--ease-out` |
| Quantity, cart totals, typing, keyboard actions | No | — | — |
| Photo reading progress | Linear bar | constant | `linear` |
| The Paid moment | Check stroke, stagger | 420 ms | `--ease-out` |

Rules: animate only `transform` and `opacity`; never `transition: all`; never `scale(0)`; never `ease-in`; transitions, not keyframes, for anything a person can trigger twice; hover effects only inside `@media (hover: hover) and (pointer: fine)`; under `prefers-reduced-motion`, keep fades and remove movement.

## Accessibility

> **What this is.** The minimum for every screen.
>
> **Why it comes here.** NFR-A11Y-01 and NFR-A11Y-02 are system requirements, and a payment flow must work for everyone.
>
> **Shelf example.** The Status "Paid" is a word, an icon and a colour, so it reads without colour.
>
> **What it produces.** The rules.

- Text contrast 4.5:1 or more; the tokens are checked in both themes.
- Every control is reachable by keyboard and has a visible 2 px focus ring (`--color-focus`, 2 px offset).
- Touch targets are 44 px or more.
- Status changes are announced with `aria-live="polite"`.
- Images have alt text from the product title; the model never writes alt text without the seller seeing it.

## Review checklist

> **What this is.** What a reviewer checks on every UI pull request.
>
> **Why it comes here.** A checklist turns taste into a test an agent can run.
>
> **Shelf example.** A pull request with `transition: all 300ms` on a button fails item 3.
>
> **What it produces.** The checklist.

1. Every value comes from `tokens.css`.
2. Prices are Geist Mono, tabular, "$0.00".
3. No `transition: all`, no `ease-in`, nothing over 300 ms except the sheet enter and the Paid moment.
4. Pressable elements scale to 0.97 on press.
5. Each state of the screen exists: loading, empty, error, success.
6. Every model-filled field shows "Suggested".
7. Every money button shows the amount.
8. Works at 375 px wide, one hand, and in dark mode.
9. Reduced motion removes movement.
10. Copy follows the voice rules in `BRAND.md`.

## The principle to remember

Decide each value once, move only when it helps, and let the product and the price be the loudest things on screen.
