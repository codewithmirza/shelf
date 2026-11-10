# ADR-005 · PayPal approval on a hosted Pay page opened with `ui/open-link`, status by polling

**Status.** Proposed, 10 Nov 2026.

**In one line.** The Storefront never runs the PayPal button. It opens `/pay/{order}?t={signed}` with `ui/open-link`, then polls `get_order_status` every 3 s until Captured, Cancelled or 10 minutes.

## Context
- PayPal's sandboxed-iframe guide needs `allow-popups` and `allow="payment"` on the iframe. A host controls the iframe of an MCP App; Shelf cannot add these.
- MCP Apps let a view ask the host to open a link (`ui/open-link`). The host may ask the person to confirm.
- `async-rent/async` pull request 59 uses the same pattern.

## Options
| | Open-link to Pay page (chosen) | PayPal button inside the Storefront | Text link only |
| --- | --- | --- | --- |
| Works in a host iframe | Yes, if open-link is allowed | Likely blocked | Yes |
| Buyer sees status in chat | Yes, by polling | Yes | No |

## Decision
1. `start_checkout` returns the Pay page link and an order token.
2. The Storefront calls `ui/open-link`. If the host refuses, it shows the link as text (FC-BUY-03-03).
3. The Pay page captures on the server after approval, then shows "Paid. You can go back to your chat."
4. The Storefront polls `get_order_status` every 3 s for at most 10 minutes.

## Consequences
- The buyer leaves the chat for the PayPal step. We say so on video and in the README: "you approve in PayPal; everything else stays in the chat".
