import { describe, expect, it } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { readFileSync } from "node:fs";
import { cents } from "@/server/domain/brand";
import type { Catalog, ProductCardRow } from "@/server/catalog";
import { fakeCatalog, testWorld } from "../support/fakes";
import type { ShelfMcpDeps } from "@/server/mcp/server";
import { createShelfServer } from "@/server/mcp/server";
import { STOREFRONT_URI } from "@/server/mcp/ui";
import { VERSION } from "@/version";

const ORIGIN = "https://shelf.test";
const row = (id: string, title: string, price: number, store = "maya-mugs"): ProductCardRow => ({
  id, title, priceFromCents: cents(price), coverKey: null, store: { slug: store, name: "Maya Mugs", refundPolicy: "Returns within 14 days." },
});

// Drives the real server over stateless Streamable HTTP, as Claude and ChatGPT do (SYS-MCP-01).
export async function rpc(catalogOrDeps: Catalog | ShelfMcpDeps, method: string, params: unknown = {}) {
  const deps: ShelfMcpDeps = "searchProducts" in catalogOrDeps ? { ...testWorld(catalogOrDeps).deps, origin: ORIGIN, version: VERSION } : catalogOrDeps;
  const handler = createMcpHandler(() => createShelfServer(deps));
  const res = await handler.fetch(
    new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const data = text.startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data: ")) ?? "").slice(6);
  return JSON.parse(data) as { result?: any; error?: any };
}

describe("MCP surface (TC-MCP-01)", () => {
  const { catalog } = fakeCatalog([]);

  it("TC-MCP-01: initialize answers with the Gate 5 identity and instructions", async () => {
    const r = await rpc(catalog, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(r.result.serverInfo).toMatchObject({ name: "shelf", title: "Shelf", version: VERSION });
    expect(r.result.instructions).toContain("Never claim an order is paid unless get_order_status says Captured");
  });

  it("TC-MCP-01: every view tool carries both _meta keys and its Gate 5 annotations", async () => {
    const r = await rpc(catalog, "tools/list");
    const byName = new Map(r.result.tools.map((t: { name: string }) => [t.name, t]));
    const expected: Record<string, Record<string, boolean>> = {
      search_products: { readOnlyHint: true },
      show_product: { readOnlyHint: true },
      update_cart: { idempotentHint: true, readOnlyHint: false },
      start_checkout: { readOnlyHint: false, destructiveHint: false },
    };
    for (const [name, annotations] of Object.entries(expected)) {
      const tool = byName.get(name) as { _meta: any; annotations: any } | undefined;
      expect(tool, name).toBeDefined();
      expect(tool!._meta.ui.resourceUri).toBe(STOREFRONT_URI);
      expect(tool!._meta["openai/outputTemplate"]).toBe(STOREFRONT_URI);
      expect(tool!.annotations).toMatchObject(annotations);
    }
  });

  it("TC-MCP-01: the Storefront resource has the MCP App MIME, resource domain and no connectDomains", async () => {
    const r = await rpc(catalog, "resources/read", { uri: STOREFRONT_URI });
    const c = r.result.contents[0];
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect(c.text).toContain("<!doctype html>");
    expect(c._meta.ui.csp).toEqual({ resourceDomains: [ORIGIN] });
    expect(c._meta.ui.prefersBorder).toBe(true);
  });

  it("TC-MCP-03 (search): text and structuredContent hold the same facts", async () => {
    const { catalog } = fakeCatalog([row("prd_1", "Speckled mug", 2400), row("prd_2", "Espresso cup", 3600)]);
    const r = await rpc(catalog, "tools/call", { name: "search_products", arguments: { query: "mug" } });
    const { structuredContent: s, content } = r.result;
    expect(s.view).toBe("results");
    expect(s.products.map((p: { id: string }) => p.id)).toEqual(["prd_1", "prd_2"]);
    expect(s.products[0].price_from).toEqual({ currency_code: "USD", value: "24.00" });
    expect(s.products[0].image_url).toBe(`${ORIGIN}/icon.svg`);
    expect(content[0].text).toBe("2 products: Speckled mug (Maya Mugs) from $24.00 [id prd_1]; Espresso cup (Maya Mugs) from $36.00 [id prd_2].");
  });

  it("TC-MCP-02 (unit part): search passes words, max price in cents and a limit of 6", async () => {
    const { catalog, seen } = fakeCatalog([]);
    await rpc(catalog, "tools/call", { name: "search_products", arguments: { query: "Blue  MUG, blue", max_price: 40, store: "maya-mugs" } });
    expect(seen[0]).toEqual({ words: ["blue", "mug"], maxPriceCents: 4000, storeSlug: "maya-mugs", limit: 6 });
  });

  it("refuses an empty query before the catalog is read", async () => {
    const { catalog, seen } = fakeCatalog([]);
    const r = await rpc(catalog, "tools/call", { name: "search_products", arguments: { query: "  " } });
    expect(r.result?.isError ?? Boolean(r.error)).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("VERSION equals package.json", () => {
    expect(VERSION).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
  });
});
