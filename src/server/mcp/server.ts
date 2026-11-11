import { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { Catalog } from "../catalog";
import type { CartDeps } from "../carts";
import type { CheckoutDeps } from "../checkout";
import type { OrderDeps } from "../orders";
import { STOREFRONT_HTML } from "./storefront.generated";
import { registerUpdateCart } from "./tools/cart";
import { registerStartCheckout } from "./tools/checkout";
import { registerOrderTools } from "./tools/order";
import { registerShowProduct } from "./tools/product";
import { registerSearch } from "./tools/search";
import { STOREFRONT_URI } from "./ui";

export interface ShelfMcpDeps {
  readonly catalog: Catalog;
  readonly carts: CartDeps;
  readonly checkout: CheckoutDeps;
  readonly orders: OrderDeps;
  // PUBLIC_ORIGIN; photos load from here, so it is the only resource domain (ADR-009).
  readonly origin: string;
  readonly version: string;
}

export const INSTRUCTIONS =
  "Shelf lets the user browse small independent stores and pay with PayPal. Show results with the Storefront. Never claim an order is paid unless get_order_status says Captured.";

// Builds one MCP server per request, so no tool keeps state between calls (ADR-002).
export function createShelfServer(deps: ShelfMcpDeps): McpServer {
  const server = new McpServer({ name: "shelf", title: "Shelf", version: deps.version }, { instructions: INSTRUCTIONS });

  const uiMeta = { ui: { csp: { resourceDomains: [deps.origin] }, prefersBorder: true } };
  registerAppResource(server, "Shelf Storefront", STOREFRONT_URI, { description: "The Shelf Storefront view.", _meta: uiMeta }, async () => ({
    contents: [{ uri: STOREFRONT_URI, mimeType: RESOURCE_MIME_TYPE, text: STOREFRONT_HTML, _meta: uiMeta }],
  }));

  registerSearch(server, deps);
  registerShowProduct(server, deps);
  registerUpdateCart(server, deps.carts);
  registerStartCheckout(server, deps.checkout);
  registerOrderTools(server, deps.orders);
  return server;
}
