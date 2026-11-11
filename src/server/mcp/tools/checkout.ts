import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { formatUsd, toMoney } from "../../domain/money";
import { readCart } from "../../carts";
import { startCheckout, type CheckoutDeps } from "../../checkout";
import { toolError } from "../result";
import { viewMeta } from "../ui";
import { cartText, toCartView } from "./cart";
import { ERROR_INFO } from "../../domain/errors";

export const checkoutInput = z.object({ cart_id: z.string().max(20).describe("The cart id from update_cart.") });

export function registerStartCheckout(server: McpServer, deps: CheckoutDeps): void {
  registerAppTool(
    server,
    "start_checkout",
    {
      title: "Pay with PayPal",
      description:
        "Create the PayPal order for a ready cart and return a Pay page link. The buyer pays on that page; the order is not paid until get_order_status says captured.",
      inputSchema: checkoutInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: viewMeta,
    },
    async (args) => {
      const r = await startCheckout(deps, args.cart_id);
      if (!r.ok) {
        // When the cart changed under the buyer, show the latest cart with the reason (cart.version_conflict).
        if (r.error.code === "cart.version_conflict" || r.error.code === "cart.not_ready") {
          const latest = await readCart(deps.carts, args.cart_id);
          if (latest.ok) {
            const { message } = ERROR_INFO[r.error.code];
            return {
              isError: true,
              content: [{ type: "text" as const, text: `${message} ${cartText(latest.value.cart, latest.value.store)}` }],
              structuredContent: { view: "cart", cart: toCartView(latest.value.cart, latest.value.store), error: { code: r.error.code, message } },
            };
          }
        }
        return toolError(r.error);
      }
      const { order, orderToken, payUrl, expiresAt } = r.value;
      return {
        content: [
          {
            type: "text",
            text: `Order ${order.id} for ${formatUsd(order.amountCents)} is ready. The buyer pays at ${payUrl} (link ends ${expiresAt.toISOString()}). Not paid yet. Order token for get_order_status: ${orderToken}`,
          },
        ],
        structuredContent: { view: "checkout", order_id: order.id, order_token: orderToken, pay_url: payUrl, total: toMoney(order.amountCents), expires_at: expiresAt.toISOString() },
      };
    },
  );
}
