import { formatUsd } from "../domain/money";
import type { StoreId } from "../domain/brand";
import { ERROR_INFO } from "../domain/errors";
import { listSellerOrders } from "../refunds";
import { editProduct, listProducts, moveProduct, type SellerProduct } from "../seller/products";
import type { AgentTool } from "./agent";

// The seller's tools on WhatsApp. The seller sets every price; the model passes on only what the seller said.
// Refunds and tracking stay in the Seller app, where a refund takes two taps (ADR-012).

const S = (description: string) => ({ type: "STRING", description });
const opt = (o: Record<string, string>) => Object.values(o).join(", ") || "One option";

const brief = (p: SellerProduct) => ({
  product_id: p.id,
  title: p.title,
  state: p.state,
  variants: p.variants.map((v) => ({ variant_id: v.id, option: opt(v.options), price_usd: v.priceCents === null ? null : (v.priceCents / 100).toFixed(2) })),
  suggested_price_usd: p.suggestedMinCents !== null && p.suggestedMaxCents !== null ? `${(p.suggestedMinCents / 100).toFixed(0)} to ${(p.suggestedMaxCents / 100).toFixed(0)} (a suggestion only)` : null,
});

export function sellerTools(db: D1Database, store: StoreId, now: () => string): AgentTool[] {
  const errText = (code: keyof typeof ERROR_INFO) => ERROR_INFO[code].message;
  return [
    {
      declaration: {
        name: "list_my_products",
        description: "List the seller's products with their state (draft or published), options, prices and Gemini's suggested price range.",
        parameters: { type: "OBJECT", properties: { state: { type: "STRING", enum: ["draft", "published", "all"], description: "Which products. Default all." } } },
      },
      async run(args) {
        const all = await listProducts(db, store);
        const want = args.state === "draft" || args.state === "published" ? all.filter((p) => p.state === args.state) : all;
        return { result: { products: want.slice(0, 20).map(brief) } };
      },
    },
    {
      declaration: {
        name: "set_prices",
        description: "Set prices the seller stated, in US dollars. Use price_for_all when the seller gave one price for every option.",
        parameters: {
          type: "OBJECT",
          properties: {
            product_id: S("The product."),
            price_for_all: { type: "NUMBER", description: "One price in US dollars for every option." },
            prices: { type: "ARRAY", items: { type: "OBJECT", properties: { variant_id: S("The option's variant id."), price: { type: "NUMBER", description: "US dollars." } }, required: ["variant_id", "price"] } },
          },
          required: ["product_id"],
        },
      },
      async run(args) {
        const all = await listProducts(db, store);
        const p = all.find((x) => x.id === args.product_id);
        if (!p) return { result: { error: "No such product in this store." } };
        const list = Array.isArray(args.prices) ? (args.prices as { variant_id: string; price: number }[]) : [];
        const variants = typeof args.price_for_all === "number" ? p.variants.map((v) => ({ id: v.id, price: args.price_for_all as number })) : list.map((x) => ({ id: x.variant_id, price: x.price }));
        if (variants.length === 0) return { result: { error: "Say which price. Ask the seller; never guess." } };
        const r = await editProduct(db, store, p.id, { variants }, now());
        return r.ok ? { result: { product: brief(r.value) } } : { result: { error: errText(r.error.code) } };
      },
    },
    {
      declaration: {
        name: "publish",
        description: "Publish a product so buyers can find it. Every option needs a price the seller set.",
        parameters: { type: "OBJECT", properties: { product_id: S("The product.") }, required: ["product_id"] },
      },
      async run(args) {
        const r = await moveProduct(db, store, String(args.product_id), "published", now());
        return r.ok ? { result: { published: brief(r.value) } } : { result: { error: errText(r.error.code) } };
      },
    },
    {
      declaration: {
        name: "unpublish",
        description: "Take a product off sale. It goes back to draft.",
        parameters: { type: "OBJECT", properties: { product_id: S("The product.") }, required: ["product_id"] },
      },
      async run(args) {
        const r = await moveProduct(db, store, String(args.product_id), "draft", now());
        return r.ok ? { result: { unpublished: brief(r.value) } } : { result: { error: errText(r.error.code) } };
      },
    },
    {
      declaration: {
        name: "list_my_orders",
        description: "List the store's paid orders, newest first, with refund requests.",
        parameters: { type: "OBJECT", properties: {} },
      },
      async run() {
        const orders = await listSellerOrders(db, store);
        return {
          result: {
            orders: orders.slice(0, 10).map((o) => ({
              order_id: o.id, state: o.state, total: formatUsd(o.amountCents), items: o.lineTitles, at: o.createdAt,
              refund_request: o.refundRequest ? { state: o.refundRequest.state, reason: o.refundRequest.reason } : null,
            })),
          },
        };
      },
    },
  ];
}

export const sellerSystem = (origin: string, storeName: string, slug: string) =>
  [
    `You are Shelf on WhatsApp, helping the seller who runs the store "${storeName}" (${origin}/s/${slug}).`,
    "Write short WhatsApp messages: one to four lines, plain text, *bold* for product names.",
    "The seller adds products by sending photos here; Gemini drafts each one and Shelf messages the draft back.",
    "The seller sets every price. Never set, round or guess a price the seller did not state. Gemini's range is only a suggestion.",
    "To publish, every option needs a price. Use list_my_products to find product and variant ids.",
    `Refunds and tracking numbers are done in the Seller app, ${origin}/app, where a refund takes two taps.`,
    "The seller can also shop: the buyer tools work for them too.",
  ].join("\n");
