import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { variantId } from "../../domain/brand";
import { MAX_LINES, MAX_QUANTITY } from "../../domain/cart";
import { formatUsd, toMoney } from "../../domain/money";
import { upsertCart, type CartDeps, type StoreRow, type StoredCart } from "../../carts";
import { toolError } from "../result";
import { viewMeta } from "../ui";

export const cartInput = z.object({
  cart_id: z.string().max(20).optional().describe("The cart id from a previous update_cart. Leave out to start a cart."),
  store: z.string().regex(/^[a-z0-9-]{3,40}$/).describe("The store slug. One cart holds one store."),
  items: z
    .array(z.object({ variant_id: z.string().min(1).max(64), quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .max(MAX_LINES)
    .describe("The whole cart. This list replaces the cart; send every item the buyer wants."),
});

export function toCartView(cart: StoredCart, store: StoreRow) {
  const issueFor = new Map(cart.issues.map((i) => [i.variantId, i.message]));
  return {
    id: cart.id,
    version: cart.version,
    store: { slug: store.slug, name: store.name, refund_policy: store.refundPolicy },
    lines: cart.lines.map((l) => ({
      variant_id: l.variantId,
      title: l.title,
      options: { ...l.options },
      quantity: l.quantity,
      unit_price: toMoney(l.unitPriceCents),
      line_total: toMoney(l.lineTotalCents),
      ...(issueFor.has(l.variantId) ? { issue: issueFor.get(l.variantId) } : {}),
    })),
    subtotal: toMoney(cart.subtotalCents),
    shipping: toMoney(cart.shippingCents),
    total: toMoney(cart.totalCents),
    validation_issues: cart.issues.map((i) => ({ code: i.code, variant_id: i.variantId, message: i.message })),
    state: cart.state,
  };
}

export function cartText(cart: StoredCart, store: StoreRow): string {
  const lines = cart.lines.map((l) => `${l.quantity} × ${l.title} ${formatUsd(l.lineTotalCents)}`);
  const head = `Cart ${cart.id} at ${store.name}: ${lines.length > 0 ? lines.join("; ") : "empty"}.`;
  const sums = ` Subtotal ${formatUsd(cart.subtotalCents)}, shipping ${formatUsd(cart.shippingCents)}, total ${formatUsd(cart.totalCents)}.`;
  const issues = cart.issues.length > 0 ? ` Needs attention: ${cart.issues.map((i) => `${i.variantId}: ${i.message}`).join("; ")}` : "";
  return head + sums + issues;
}

export function registerUpdateCart(server: McpServer, deps: CartDeps): void {
  registerAppTool(
    server,
    "update_cart",
    {
      title: "Update the cart",
      description: "Create or replace the buyer's cart for one store. The server prices every line from stored prices.",
      inputSchema: cartInput,
      annotations: { idempotentHint: true, readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: viewMeta,
    },
    async (args) => {
      const r = await upsertCart(deps, {
        cartId: args.cart_id,
        storeSlug: args.store,
        items: args.items.map((i) => ({ variantId: variantId(i.variant_id), quantity: i.quantity })),
        channel: "storefront",
        actor: "buyer",
      });
      if (!r.ok) return toolError(r.error);
      return { content: [{ type: "text", text: cartText(r.value.cart, r.value.store) }], structuredContent: { view: "cart", cart: toCartView(r.value.cart, r.value.store) } };
    },
  );
}
