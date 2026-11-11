import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { formatUsd, toMoney, type Money } from "../../domain/money";
import { domainError } from "../../domain/errors";
import type { Catalog, ProductDetailRow } from "../../catalog";
import { toolError } from "../result";
import { viewMeta } from "../ui";

export const productInput = z.object({ product_id: z.string().regex(/^prd_[A-Za-z0-9_]{1,40}$/).describe("A product id from search_products.") });

export interface ProductDetail {
  id: string;
  title: string;
  description: string;
  images: string[];
  variants: { id: string; options: Record<string, string>; price: Money; in_stock: boolean }[];
}

const photoUrl = (origin: string, key: string) => `${origin}/photos/${encodeURIComponent(key)}`;

export function toDetail(p: ProductDetailRow, origin: string): ProductDetail {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    images: p.imageKeys.length > 0 ? p.imageKeys.map((k) => photoUrl(origin, k)) : [`${origin}/icon.svg`],
    variants: p.variants.map((v) => ({ id: v.id, options: { ...v.options }, price: toMoney(v.priceCents), in_stock: v.stock > 0 })),
  };
}

const describeOptions = (o: Readonly<Record<string, string>>) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ");

export function productText(p: ProductDetailRow): string {
  const variants = p.variants.map((v) => `${describeOptions(v.options) || "One option"} ${formatUsd(v.priceCents)}${v.stock > 0 ? "" : " (sold out)"} [variant ${v.id}]`);
  const policy = p.store.refundPolicy ? ` Refunds: ${p.store.refundPolicy}` : "";
  return `${p.title} from ${p.store.name} (store ${p.store.slug}). ${p.description} Options: ${variants.join("; ")}.${policy}`;
}

export function registerShowProduct(server: McpServer, deps: { catalog: Catalog; origin: string }): void {
  registerAppTool(
    server,
    "show_product",
    {
      title: "Show a product",
      description: "Show one product with its options, prices and the store's refund policy.",
      inputSchema: productInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: viewMeta,
    },
    async (args) => {
      const p = await deps.catalog.getProduct(args.product_id);
      if (!p) return toolError(domainError("not_found", "product"));
      return {
        content: [{ type: "text", text: productText(p) }],
        structuredContent: { view: "product", product: toDetail(p, deps.origin), store: { slug: p.store.slug, name: p.store.name, refund_policy: p.store.refundPolicy } },
      };
    },
  );
}
