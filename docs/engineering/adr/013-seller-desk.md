# ADR-013 · A Seller desk on AG Grid for laptops

**Status.** Accepted, 12 Nov 2026.

**In one line.** `/desk` shows the seller's product options and paid orders in two AG Grid Community grids, with price and stock edited in place through the existing Seller app API.

## Context
- The Seller app is a 480 px phone column (DESIGN-SYSTEM.md). A seller with many products or orders on a laptop wants to scan, sort and filter.
- Every price rule (INV-03) lives on the server in `editProduct` and `moveProduct`. A second client must not add a second copy.

## Decision
1. AG Grid Community 36.2.0 (pinned, ADR-011), `AllCommunityModule`, React wrapper. No Enterprise features.
2. One row per variant. Price and stock cells are editable; an edit sends the same `PATCH /api/seller/products/{id}` as the phone screen. A refused value shows the server's message and the grid reloads.
3. Publish and Unpublish call the existing routes. Orders link to the Seller app's order screen, where refunds take two taps.
4. The grid theme is `themeQuartz` with every colour set to a Shelf token (`var(--color-…)`), so the theme switch and dark mode apply without a second palette.

## Consequences
- No new server code and no new money path.
- On a phone, the desk points the seller to the Seller app.
