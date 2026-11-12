import type { AgentTool, ToolRun } from "./agent";
import type { Outgoing } from "./graph";
import type { ToolAnswer } from "./local_mcp";

// The buyer's tools on WhatsApp. Each one calls a Shelf MCP tool; Shelf keeps the cart id and the order tokens,
// so the model cannot lose them or leak them.

export interface BuyerPorts {
  call(name: string, args: Record<string, unknown>): Promise<ToolAnswer>;
  cartId(): string | null;
  setCartId(id: string | null): Promise<void>;
  orders(): Promise<{ orderId: string; token: string }[]>;
  rememberOrder(orderId: string, token: string): Promise<void>;
  watchOrder(orderId: string): Promise<void>;
}

const S = (description: string) => ({ type: "STRING", description });

interface Card { id: string; title: string; price_from: { value: string }; image_url: string; store: { slug: string; name: string } }
interface Detail { id: string; title: string; images: string[]; variants: { id: string; options: Record<string, string>; price: { value: string }; in_stock: boolean }[] }

const fail = (a: ToolAnswer): ToolRun => ({ result: { error: a.text } });
const usd = (v: string) => `$${v}`;

export function buyerTools(p: BuyerPorts): AgentTool[] {
  return [
    {
      declaration: {
        name: "search_products",
        description: "Search products that independent sellers published on Shelf. Shelf sends the buyer a photo of each of the first results.",
        parameters: { type: "OBJECT", properties: { query: S("What the buyer wants, in their words."), max_price: { type: "NUMBER", description: "Highest price in US dollars, if the buyer gave one." } }, required: ["query"] },
      },
      async run(args) {
        const a = await p.call("search_products", args);
        if (a.isError) return fail(a);
        const products = ((a.structured?.products ?? []) as Card[]).slice(0, 6);
        const outgoing: Outgoing[] = products.slice(0, 3).map((c, i) => ({
          kind: "image",
          link: c.image_url,
          caption: `${i + 1}. *${c.title}*\nfrom ${usd(c.price_from.value)} · ${c.store.name}`,
        }));
        return {
          result: { found: products.length, products: products.map((c, i) => ({ number: i + 1, product_id: c.id, title: c.title, price_from_usd: c.price_from.value, store: c.store.slug, photo_sent: i < 3 })) },
          outgoing,
        };
      },
    },
    {
      declaration: {
        name: "show_product",
        description: "Read one product: description, options and the variant id and price of each option. Call it before adding to the cart.",
        parameters: { type: "OBJECT", properties: { product_id: S("The product_id from search_products.") }, required: ["product_id"] },
      },
      async run(args) {
        const a = await p.call("show_product", args);
        if (a.isError) return fail(a);
        const d = a.structured?.product as Detail | undefined;
        const outgoing: Outgoing[] = d?.images[0]
          ? [{ kind: "image", link: d.images[0], caption: `*${d.title}*\n${d.variants.map((v) => `• ${Object.values(v.options).join(", ") || "One option"}: ${usd(v.price.value)}${v.in_stock ? "" : " (sold out)"}`).join("\n")}` }]
          : [];
        return { result: { details: a.text, store: (a.structured?.store as { slug: string } | undefined)?.slug }, outgoing };
      },
    },
    {
      declaration: {
        name: "update_cart",
        description: "Set the buyer's whole cart for one store. Send every item the buyer wants; this list replaces the cart. Shelf prices every line.",
        parameters: {
          type: "OBJECT",
          properties: {
            store: S("The store slug of the products."),
            items: { type: "ARRAY", items: { type: "OBJECT", properties: { variant_id: S("A variant id from show_product."), quantity: { type: "INTEGER", description: "1 to 10." } }, required: ["variant_id", "quantity"] } },
          },
          required: ["store", "items"],
        },
      },
      async run(args) {
        const current = p.cartId();
        let a = await p.call("update_cart", current ? { ...args, cart_id: current } : args);
        // A cart holds one store, and an old cart may be paid or expired: start a new one.
        if (a.isError && current) a = await p.call("update_cart", args);
        if (a.isError) return fail(a);
        const cart = a.structured?.cart as { id: string } | undefined;
        if (cart) await p.setCartId(cart.id);
        return { result: { cart: a.text } };
      },
    },
    {
      declaration: {
        name: "checkout",
        description: "Create the PayPal order for the current cart. Shelf sends the buyer the Pay link itself. Call it only after the buyer agreed to the total.",
        parameters: { type: "OBJECT", properties: {} },
      },
      async run() {
        const cartId = p.cartId();
        if (!cartId) return { result: { error: "The cart is empty. Add something first." } };
        const a = await p.call("start_checkout", { cart_id: cartId });
        if (a.isError) return fail(a);
        const s = a.structured as { order_id: string; order_token: string; pay_url: string; total: { value: string } } | null;
        if (!s) return fail(a);
        await p.rememberOrder(s.order_id, s.order_token);
        await p.setCartId(null);
        await p.watchOrder(s.order_id);
        return {
          result: { order_id: s.order_id, total_usd: s.total.value, pay_link: "sent to the buyer by Shelf; do not repeat it", paid: false },
          outgoing: [{ kind: "text", body: `Pay ${usd(s.total.value)} with PayPal here. The link works for 30 minutes:\n${s.pay_url}\n\nI'll message you here as soon as PayPal confirms.` }],
        };
      },
    },
    {
      declaration: {
        name: "order_status",
        description: "Read the state of the buyer's order: paid, shipped with tracking, refund. The latest order when no id is given.",
        parameters: { type: "OBJECT", properties: { order_id: S("Optional. An order id from checkout.") } },
      },
      async run(args) {
        const mine = await p.orders();
        const o = typeof args.order_id === "string" ? mine.find((x) => x.orderId === args.order_id) : mine[0];
        if (!o) return { result: { error: "This WhatsApp number has no Shelf orders." } };
        const a = await p.call("get_order_status", { order_id: o.orderId, order_token: o.token });
        return a.isError ? fail(a) : { result: { order: a.text } };
      },
    },
    {
      declaration: {
        name: "request_refund",
        description: "Ask the seller for a refund of a paid order. Only the seller decides; say so.",
        parameters: { type: "OBJECT", properties: { order_id: S("Optional. The latest order when left out."), reason: S("Why, in the buyer's words.") }, required: ["reason"] },
      },
      async run(args) {
        const mine = await p.orders();
        const o = typeof args.order_id === "string" ? mine.find((x) => x.orderId === args.order_id) : mine[0];
        if (!o) return { result: { error: "This WhatsApp number has no Shelf orders." } };
        const a = await p.call("request_refund", { order_id: o.orderId, order_token: o.token, reason: args.reason });
        return a.isError ? fail(a) : { result: { order: a.text } };
      },
    },
  ];
}

export const buyerSystem = (origin: string) =>
  [
    "You are Shelf on WhatsApp. You help people buy from small independent sellers and pay with PayPal (sandbox, prices in US dollars).",
    "Write short WhatsApp messages: one to four lines, plain text, *bold* for product names. No markdown headings or links.",
    "Only state products, prices and order states that a tool returned. Never invent them.",
    "To buy: search_products, then show_product for the one the buyer picks, then update_cart with variant ids, tell the buyer the total, and call checkout only when they agree.",
    "Shelf sends product photos and the Pay link itself, so refer to them (\"the photos above\", \"the link above\") instead of repeating them.",
    "An order is paid only when order_status says Paid. Refunds are requests; only the seller approves them.",
    `If someone wants to sell on Shelf, tell them to open ${origin}/app, sign in with PayPal, and connect WhatsApp on the Store screen.`,
  ].join("\n");
