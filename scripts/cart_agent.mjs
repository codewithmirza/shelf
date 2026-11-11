#!/usr/bin/env node
// Plays another AI agent against the Cart API v1 (TC-CART-01, FL-AGT-01). It uses only what a real agent has:
// the store link name, a store key from the Seller app, and the public products from search.
//
//   SHELF_URL=https://shelf….workers.dev SHELF_STORE=maya-mugs SHELF_KEY=shelf_sk_… node scripts/cart_agent.mjs
//   … prints approve_url; open it, approve with the sandbox buyer, then run again with CART=… PAYPAL_ORDER=…
const base = (process.env.SHELF_URL ?? "").replace(/\/$/, "");
const store = process.env.SHELF_STORE;
const key = process.env.SHELF_KEY;
if (!base || !store || !key) { console.error("Set SHELF_URL, SHELF_STORE and SHELF_KEY."); process.exit(2); }
const api = `${base}/api/stores/${store}/merchant-cart`;
const call = async (method, path, body) => {
  const res = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  console.log(`${method} ${path || "/"} → ${res.status}`, json?.error?.code ?? json?.state ?? "");
  return { status: res.status, json };
};

if (process.env.CART && process.env.PAYPAL_ORDER) {
  const done = await call("POST", `/${process.env.CART}/checkout`, { paypal_order_id: process.env.PAYPAL_ORDER });
  console.log(done.status === 200 ? `Completed. Capture ${done.json.capture_id}.` : "Not approved yet: open approve_url first.");
  process.exit(done.status === 200 ? 0 : 1);
}

// Find a product of this store through the public MCP search, as an agent would.
const mcp = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_products", arguments: { query: process.env.SHELF_QUERY ?? "a", store } } }) });
const text = await mcp.text();
const data = JSON.parse(text.trimStart().startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: ")).slice(6));
const product = data.result.structuredContent.products[0];
if (!product) { console.error("This store has no published products yet."); process.exit(1); }
const show = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "show_product", arguments: { product_id: product.id } } }) });
const st = await show.text();
const detail = JSON.parse(st.trimStart().startsWith("{") ? st : st.split("\n").find((l) => l.startsWith("data: ")).slice(6)).result.structuredContent.product;
const variant = detail.variants.find((v) => v.in_stock);

const created = await call("POST", "", { items: [{ variant_id: variant.id, quantity: 2 }] });
const id = created.json.id;
const replaced = await call("PUT", `/${id}`, { items: [{ variant_id: variant.id, quantity: 1 }] });
console.log(`Replace kept ${replaced.json.lines.length} line, quantity ${replaced.json.lines[0].quantity}, total ${replaced.json.total.value}`);
await call("GET", `/${id}`);
const prep = await call("POST", `/${id}/checkout`, {});
const early = await call("POST", `/${id}/checkout`, { paypal_order_id: prep.json.paypal_order_id });
console.log(early.status === 422 ? "Capture before approval was refused (422), as it should be." : "Unexpected answer before approval.");
console.log(`\nOpen and approve: ${prep.json.approve_url}\nThen: CART=${id} PAYPAL_ORDER=${prep.json.paypal_order_id} node scripts/cart_agent.mjs`);
