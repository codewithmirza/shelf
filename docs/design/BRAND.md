# Shelf · Brand

> **What this is.** Who Shelf is, how it looks and how it talks. The visual rules live in `DESIGN-SYSTEM.md`; this file gives the reasons.
>
> **Why it comes here.** Every screen and every sentence makes a promise about money. A brand decided once keeps those promises the same in the Seller app, the Storefront, the Pay page and the video.
>
> **Shelf example.** In the Storefront the only colour in the cart is the PayPal button and the product photo. A buyer knows where to tap without reading.
>
> **What it produces.** The point of view, the feeling, the logo rules and the voice.

Base: Emil Kowalski's design-engineering standards (github.com/emilkowalski/skills, read 10 Nov 2026). Taste reference only, not copied: boat.dev (honest numbers, product shown as it is, low energy, one strong decision per screen).

## Point of view

> **What this is.** The one idea every design choice comes from.
>
> **Why it comes here.** When two choices look equal, the point of view decides.
>
> **Shelf example.** Should the cart card have a brand colour? No: a quiet shelf lets the product be loud.
>
> **What it produces.** The idea and four principles.

**A quiet shelf. The product is loud.**

A real shelf is plain wood or metal. It holds the thing you came for and gets out of the way. Shelf is the same: neutral surfaces, real photos, exact prices, and one clear next step.

| Principle | Means | Example |
| --- | --- | --- |
| The product is the colour | No brand accent in the UI. Colour comes from seller photos, the PayPal button and state. | The Pay button is PayPal's own; we never restyle it. |
| Say the true number | Prices, totals and times are exact and in a mono face. No "about", no rounding. | "$32.00", not "$32". |
| A person at every money step | Every money action is one obvious tap by a person, with the amount in the button. | "Refund $32.00". |
| Unseen details compound | Press feedback, origin-aware menus, tabular numbers, no layout jumps. People feel it without naming it. | Totals never jitter when a quantity changes. |

## How people should feel

> **What this is.** The feeling each person should have, in their words.
>
> **Why it comes here.** "UX right in one go" means each screen is judged against a feeling, not only against a spec.
>
> **Shelf example.** Maya, after publishing: "That took two minutes and it looks better than my Instagram."
>
> **What it produces.** One feeling per person.

| Person | Feeling | Not |
| --- | --- | --- |
| Maya (seller) | "It did the boring part. I stay in charge." | "A robot runs my shop." |
| Ben (buyer) | "I can see what I'm paying for, and I trust it." | "Where did that link take me?" |
| Jo (judge) | "This is a real product, and it doesn't oversell itself." | "Another demo with fake numbers." |

## Logo

> **What this is.** The mark, the wordmark, the lockup and the app icon, and how to use them.
>
> **Why it comes here.** The logo shows in the host's connector list, the browser tab and the video. It must read at 16 px.
>
> **Shelf example.** In Claude's connector list the 16 px mark is a box and a ball on a line: things on a shelf.
>
> **What it produces.** The files and the rules.

The mark is two things standing on a shelf: a box and a round jar. It says "small shop" without a cart or a bag, which every commerce app already uses.

| File | Use |
| --- | --- |
| `assets/logo.svg`, `assets/logo-dark.svg` | Lockup: mark and wordmark. Landing page, README, video titles. |
| `assets/mark.svg` | The mark alone. Storefront header (16 px), "Sold on Shelf" line. |
| `assets/icon.svg` | App icon, 512 px, PWA manifest, connector icon. |
| `assets/favicon.svg` | Browser tab; follows the system theme. |
| `assets/wordmark.svg` | Wordmark alone, where the mark is already on screen. |

Rules:
1. The logo is ink on paper, or paper on ink. No other colours, no gradients, no shadows.
2. Clear space around the lockup equals the height of the box in the mark.
3. Minimum size: mark 16 px, lockup 20 px tall.
4. The wordmark is always lower case: "shelf". In sentences, write "Shelf".
5. Never put the Shelf mark next to the PayPal logo as if they were one brand. Write "Pay with PayPal" and use PayPal's own button.

## Voice

> **What this is.** How Shelf writes.
>
> **Why it comes here.** Copy carries trust in a payment flow more than colour does.
>
> **Shelf example.** "PayPal didn't finish. Your cart is saved." tells Ben what happened and that nothing is lost.
>
> **What it produces.** The voice rules and examples.

Plain, exact, calm. Shelf talks like a good shopkeeper: short sentences, true numbers, no hype.

| Do | Don't |
| --- | --- |
| "Paid. $32.00 to Maya Mugs." | "Woohoo! Your order is confirmed!" |
| "We read 3 photos. Check the prices." | "AI magic created your listings!" |
| "Suggested: $28 to $34" | "Optimal price: $31.47" |
| "PayPal isn't answering. Your cart is saved." | "Oops, something went wrong." |
| "Refund $32.00" | "Submit" |

Rules: no exclamation marks; no "AI-powered"; numbers with currency and two decimals; one name per thing (the Gate 2 glossary); buttons say what they do.

## The principle to remember

Shelf stays quiet so the product, the price and the person's choice are the loudest things on screen.
