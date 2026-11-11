import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { cents } from "../../domain/brand";
import { formatUsd, toMoney, type Money } from "../../domain/money";
import type { Catalog, ProductCardRow } from "../../catalog";
import { viewMeta } from "../ui";

export const MAX_RESULTS = 6;

export const searchInput = z.object({
  query: z.string().trim().min(1).max(200).describe("What the buyer is looking for, in their words."),
  max_price: z.number().positive().max(10_000).optional().describe("Highest price in US dollars."),
  store: z.string().regex(/^[a-z0-9-]{3,40}$/).optional().describe("A store slug, to search one store."),
});

export interface ProductCard {
  id: string;
  title: string;
  price_from: Money;
  image_url: string;
  store: { slug: string; name: string; refund_policy: string | null };
}

// Lower-case words of two letters or more; the same normalisation as products.search_text.
export const queryWords = (q: string) => [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))].slice(0, 8);

export const toCard = (r: ProductCardRow, origin: string): ProductCard => ({
  id: r.id,
  title: r.title,
  price_from: toMoney(r.priceFromCents),
  image_url: r.coverKey ? `${origin}/photos/${encodeURIComponent(r.coverKey)}` : `${origin}/icon.svg`,
  store: { slug: r.store.slug, name: r.store.name, refund_policy: r.store.refundPolicy },
});

// The text block holds the same facts as structuredContent, for hosts without MCP Apps (SYS-MCP-02).
export function searchText(rows: readonly ProductCardRow[], query: string): string {
  if (rows.length === 0) return `No products match "${query}".`;
  const list = rows.map((r) => `${r.title} (${r.store.name}) from ${formatUsd(r.priceFromCents)} [id ${r.id}]`);
  return `${rows.length} product${rows.length === 1 ? "" : "s"}: ${list.join("; ")}.`;
}

export function registerSearch(server: McpServer, deps: { catalog: Catalog; origin: string }): void {
  registerAppTool(
    server,
    "search_products",
    {
      title: "Search products",
      description: "Search published products across small independent stores. Show the results with the Storefront.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: viewMeta,
    },
    async (args) => {
      const rows = await deps.catalog.searchProducts({
        words: queryWords(args.query),
        maxPriceCents: args.max_price === undefined ? null : cents(Math.round(args.max_price * 100)),
        storeSlug: args.store ?? null,
        limit: MAX_RESULTS,
      });
      const shown = rows.slice(0, MAX_RESULTS);
      const products = shown.map((r) => toCard(r, deps.origin));
      return {
        content: [{ type: "text", text: searchText(shown, args.query) }],
        structuredContent: { view: "results", products },
      };
    },
  );
}
