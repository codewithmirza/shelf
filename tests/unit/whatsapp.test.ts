import { describe, expect, it } from "vitest";
import { runAgent, nextHistory, type AgentTool } from "@/server/whatsapp/agent";
import { buyerTools, type BuyerPorts } from "@/server/whatsapp/buyer";
import { messageBody, parseInbound, signatureValid } from "@/server/whatsapp/graph";
import type { ToolAnswer } from "@/server/whatsapp/local_mcp";
import type { VertexDeps } from "@/server/model/vertex";

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("WhatsApp webhook (ADR-012)", () => {
  it("TC-WA-01: only a delivery signed with the app secret is accepted", async () => {
    const body = JSON.stringify({ entry: [] });
    expect(await signatureValid("app-secret", body, await sign("app-secret", body))).toBe(true);
    expect(await signatureValid("app-secret", body + " ", await sign("app-secret", body))).toBe(false);
    expect(await signatureValid("app-secret", body, await sign("other", body))).toBe(false);
    expect(await signatureValid("app-secret", body, null)).toBe(false);
    expect(await signatureValid("", body, "sha256=00")).toBe(false);
  });

  it("TC-WA-02: reads text and image messages and ignores status updates", () => {
    const delivery = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: {
        messages: [
          { id: "wamid.1", from: "919800000001", type: "text", text: { body: "laddu under $20" } },
          { id: "wamid.2", from: "919800000002", type: "image", image: { id: "media-9", caption: "new box" } },
          { id: "wamid.3", from: "919800000003", type: "sticker" },
        ],
      } }, { value: { statuses: [{ id: "wamid.0", status: "delivered" }] } }] }],
    };
    expect(parseInbound(delivery)).toEqual([
      { id: "wamid.1", from: "919800000001", kind: "text", text: "laddu under $20" },
      { id: "wamid.2", from: "919800000002", kind: "image", mediaId: "media-9", caption: "new box" },
      { id: "wamid.3", from: "919800000003", kind: "other" },
    ]);
    expect(parseInbound({ nonsense: true })).toEqual([]);
  });

  it("caps message lengths at WhatsApp's limits", () => {
    const t = messageBody("91", { kind: "text", body: "x".repeat(5000) }) as { text: { body: string } };
    expect(t.text.body.length).toBe(4096);
    const i = messageBody("91", { kind: "image", link: "https://x/p.webp", caption: "y".repeat(2000) }) as { image: { caption: string } };
    expect(i.image.caption.length).toBe(1024);
  });
});

// A Gemini stand-in: answers each request with the next scripted turn and records what it was sent.
function fakeGemini(turns: unknown[][]): { deps: VertexDeps; sent: { contents: { role: string; parts: unknown[] }[] }[] } {
  const sent: { contents: { role: string; parts: unknown[] }[] }[] = [];
  let i = 0;
  const deps: VertexDeps = {
    mode: "api_key",
    apiKey: "k",
    fetch: (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      const parts = turns[Math.min(i++, turns.length - 1)];
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
    }) as typeof fetch,
  };
  return { deps, sent };
}

describe("WhatsApp agent loop (ADR-012)", () => {
  it("TC-WA-03: runs the tool the model calls, returns the model's turn verbatim, and sends Shelf's own messages first", async () => {
    const g = fakeGemini([
      [{ functionCall: { name: "echo", args: { q: "laddu" } }, thoughtSignature: "sig-1" }],
      [{ text: "Here you go." }],
    ]);
    const echo: AgentTool = {
      declaration: { name: "echo", description: "", parameters: { type: "OBJECT", properties: {} } },
      run: async (args) => ({ result: { got: args.q }, outgoing: [{ kind: "text", body: "photo" }] }),
    };
    const r = await runAgent(g.deps, "system", [], "hi", [echo]);
    expect(r).toEqual({ text: "Here you go.", outgoing: [{ kind: "text", body: "photo" }] });
    const second = g.sent[1]!.contents;
    expect(second[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "echo", args: { q: "laddu" } }, thoughtSignature: "sig-1" }] });
    expect(second[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "echo", response: { result: { got: "laddu" } } } }] });
  });

  it("stops after the step limit and keeps history to plain text turns", async () => {
    const g = fakeGemini([[{ functionCall: { name: "nope", args: {} } }]]);
    const r = await runAgent(g.deps, "s", [], "hi", []);
    expect(r.text).toMatch(/too many steps/);
    let h = nextHistory([], "a", "b");
    for (let n = 0; n < 20; n++) h = nextHistory(h, `u${n}`, `m${n}`);
    expect(h.length).toBe(16);
    expect(h[0]!.role).toBe("user");
  });
});

function ports(answers: Record<string, ToolAnswer>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const state = { cart: "CART-ABCDEFGHJKLM" as string | null, remembered: [] as string[][], watched: [] as string[] };
  const p: BuyerPorts = {
    call: async (name, args) => { calls.push({ name, args }); return answers[name]!; },
    cartId: () => state.cart,
    setCartId: async (id) => { state.cart = id; },
    orders: async () => [{ orderId: "ord_1", token: "tok-secret" }],
    rememberOrder: async (o, t) => { state.remembered.push([o, t]); },
    watchOrder: async (o) => { state.watched.push(o); },
  };
  return { p, calls, state };
}

describe("WhatsApp buyer tools (ADR-012)", () => {
  it("TC-WA-04: checkout sends the exact Pay link itself and never shows the model the order token", async () => {
    const { p, calls, state } = ports({
      start_checkout: { text: "ok", isError: false, structured: { order_id: "ord_1", order_token: "tok-secret", pay_url: "https://shelf.test/pay/ord_1?t=abc", total: { value: "19.00" } } },
    });
    const checkout = buyerTools(p).find((t) => t.declaration.name === "checkout")!;
    const r = await checkout.run({});
    expect(calls).toEqual([{ name: "start_checkout", args: { cart_id: "CART-ABCDEFGHJKLM" } }]);
    expect(JSON.stringify(r.result)).not.toContain("tok-secret");
    expect(JSON.stringify(r.result)).not.toContain("https://");
    expect(r.outgoing?.[0]).toMatchObject({ kind: "text" });
    expect((r.outgoing![0] as { body: string }).body).toContain("https://shelf.test/pay/ord_1?t=abc");
    expect(state).toEqual({ cart: null, remembered: [["ord_1", "tok-secret"]], watched: ["ord_1"] });
  });

  it("TC-WA-05: order status uses the stored token, and the model never passes one", async () => {
    const { p, calls } = ports({ get_order_status: { text: "Order ord_1 at Alcooz: Paid, $19.00.", isError: false, structured: null } });
    const status = buyerTools(p).find((t) => t.declaration.name === "order_status")!;
    expect(JSON.stringify(status.declaration.parameters)).not.toContain("token");
    const r = await status.run({});
    expect(calls[0]).toEqual({ name: "get_order_status", args: { order_id: "ord_1", order_token: "tok-secret" } });
    expect(r.result).toEqual({ order: "Order ord_1 at Alcooz: Paid, $19.00." });
  });

  it("search sends a photo of each of the first three results", async () => {
    const card = (n: number) => ({ id: `prd_${n}`, title: `Laddu ${n}`, price_from: { value: "14.00" }, image_url: `https://shelf.test/photos/${n}.webp`, store: { slug: "alcooz", name: "Alcooz" } });
    const { p } = ports({ search_products: { text: "4 products", isError: false, structured: { products: [card(1), card(2), card(3), card(4)] } } });
    const r = await buyerTools(p)[0]!.run({ query: "laddu" });
    expect(r.outgoing?.map((o) => (o.kind === "image" ? o.link : ""))).toEqual(["https://shelf.test/photos/1.webp", "https://shelf.test/photos/2.webp", "https://shelf.test/photos/3.webp"]);
    expect((r.result as { found: number }).found).toBe(4);
  });
});
