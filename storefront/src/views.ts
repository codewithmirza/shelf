import { z } from "zod";

// The Gate 5 shapes the Storefront receives in structuredContent. Parsed, never trusted as-is (CQ-21).
const money = z.object({ currency_code: z.literal("USD"), value: z.string() });
const store = z.object({ slug: z.string(), name: z.string(), refund_policy: z.string().nullable() });
const card = z.object({ id: z.string(), title: z.string(), price_from: money, image_url: z.string(), store });
const product = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  images: z.array(z.string()),
  variants: z.array(z.object({ id: z.string(), options: z.record(z.string(), z.string()), price: money, in_stock: z.boolean() })),
});
const line = z.object({ variant_id: z.string(), title: z.string(), options: z.record(z.string(), z.string()), quantity: z.number(), unit_price: money, line_total: money, issue: z.string().optional() });
const issue = z.object({ code: z.string(), variant_id: z.string().optional(), message: z.string() });
const cart = z.object({ id: z.string(), version: z.number(), store, lines: z.array(line), subtotal: money, shipping: money, total: money, validation_issues: z.array(issue), state: z.string() });
const order = z.object({
  id: z.string(),
  state: z.enum(["created", "approved", "captured", "shipped", "refunded", "cancelled"]),
  store: z.string(),
  total: money,
  lines: z.array(line.omit({ issue: true })),
  tracking: z.object({ carrier: z.string(), number: z.string() }).nullable(),
  refund_request: z.object({ state: z.enum(["pending", "approved", "declined", "done", "failed"]), decline_reason: z.string().nullable() }).nullable(),
  timeline: z.array(z.object({ at: z.string(), actor: z.string(), text: z.string() })),
});
const error = z.object({ code: z.string(), message: z.string() });

const viewSchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("results"), products: z.array(card) }),
  z.object({ view: z.literal("product"), product, store }),
  z.object({ view: z.literal("cart"), cart, error: error.optional() }),
  z.object({ view: z.literal("checkout"), order_id: z.string(), order_token: z.string(), pay_url: z.string(), total: money, expires_at: z.string() }),
  z.object({ view: z.literal("order"), order }),
  z.object({ view: z.literal("error"), error }),
]);

export type View = z.infer<typeof viewSchema>;
export type Money = z.infer<typeof money>;
export type Card = z.infer<typeof card>;
export type Cart = z.infer<typeof cart>;
export type Product = z.infer<typeof product>;
export type Order = z.infer<typeof order>;
export type Store = z.infer<typeof store>;

export function parseView(structured: unknown): View | null {
  const r = viewSchema.safeParse(structured);
  return r.success ? r.data : null;
}

// "$32.00". The server sends exact decimal strings; the Storefront never does money arithmetic.
export const usd = (m: Money) => `$${Number(m.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
