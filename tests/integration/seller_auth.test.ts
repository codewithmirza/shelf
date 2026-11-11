import { describe, expect, it } from "vitest";
import { authorizeUrl, identityFrom, identityFromCode } from "@/server/auth/paypal_login";
import { SESSION_COOKIE, cookie, d1SessionRepo, readCookie, signIn } from "@/server/auth/session";
import { createStore, d1SellerStoreRepo, slugify } from "@/server/seller/stores";
import type { PayPalDeps } from "@/server/paypal/http";
import { sqliteD1 } from "../support/d1";
import { fakeIds } from "../support/fakes";

const who = { accountId: "PAYERID123", isPayerId: false, email: "maya@seller.test", name: "Maya" };

describe("Log in with PayPal (TC-SEL-01)", () => {
  it("the authorize URL asks for the ADR-008 scopes, with state and the return URL", () => {
    const u = new URL(authorizeUrl("https://api-m.sandbox.paypal.com", "CID", "https://s.test/api/auth/paypal/return", "ST"));
    expect(u.origin + u.pathname).toBe("https://www.sandbox.paypal.com/connect");
    expect(u.searchParams.get("scope")).toBe("openid email https://uri.paypal.com/services/paypalattributes");
    // Spaces must be %20: PayPal reads "+" literally and would see one unknown scope.
    expect(u.search).toContain("scope=openid%20email%20https%3A%2F%2Furi.paypal.com%2Fservices%2Fpaypalattributes");
    expect(u.search).not.toContain("+");
    expect([u.searchParams.get("state"), u.searchParams.get("redirect_uri"), u.searchParams.get("response_type")]).toEqual(["ST", "https://s.test/api/auth/paypal/return", "code"]);
  });

  it("reads both userinfo schemas; an answer without email is refused", () => {
    expect(identityFrom({ payer_id: "P1", emails: [{ value: "a@x.test", primary: false }, { value: "Main@X.test", primary: true }], name: "A" })).toEqual({ ok: true, value: { accountId: "P1", isPayerId: true, email: "main@x.test", name: "A" } });
    expect(identityFrom({ user_id: "https://www.paypal.com/webapps/auth/identity/user/U9", email: "b@x.test" })).toMatchObject({ ok: true, value: { accountId: "U9", isPayerId: false } });
    // A payer ID alone is enough: payments go to it as merchant_id even when no email is shared.
    expect(identityFrom({ payer_id: "ABCDEFGHJKLMN" })).toEqual({ ok: true, value: { accountId: "ABCDEFGHJKLMN", isPayerId: true, email: "", name: "Seller" } });
    expect(identityFrom({ user_id: "https://x/U9" }).ok).toBe(false);
  });

  it("exchanges the code once and falls back to the older userinfo path", async () => {
    const calls: string[] = [];
    const deps: PayPalDeps = {
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "CID", clientSecret: "SEC", sleep: async () => {},
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(url.replace("https://api-m.sandbox.paypal.com", ""));
        if (url.endsWith("/v1/oauth2/token")) {
          expect(String(init?.body)).toContain("grant_type=authorization_code&code=CODE1");
          return Response.json({ access_token: "AT" });
        }
        if (url.includes("paypalv1.1")) return new Response("", { status: 404 });
        return Response.json({ user_id: "U1", email: "maya@seller.test", name: "Maya" });
      },
    };
    expect(await identityFromCode(deps, "CODE1", "https://s.test/r")).toMatchObject({ ok: true, value: { accountId: "U1" } });
    expect(calls).toEqual(["/v1/oauth2/token", "/v1/identity/oauth2/userinfo?schema=paypalv1.1", "/v1/identity/openidconnect/userinfo?schema=openid"]);
  });

  it("when userinfo refuses, the ID token from the token answer identifies the seller", async () => {
    const claims = btoa(JSON.stringify({ sub: "https://www.paypal.com/webapps/auth/identity/user/U1", payer_id: "ABCDEFGHJKLMN", email: "maya@seller.test" })).replace(/=+$/, "");
    const deps: PayPalDeps = {
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "CID", clientSecret: "SEC", sleep: async () => {},
      fetch: async (input) => (String(input).endsWith("/v1/oauth2/token") ? Response.json({ access_token: "AT", id_token: `h.${claims}.s` }) : new Response("", { status: 401 })),
    };
    expect(await identityFromCode(deps, "C", "https://s.test/r")).toEqual({ ok: true, value: { accountId: "ABCDEFGHJKLMN", isPayerId: true, email: "maya@seller.test", name: "maya" } });
  });

  it("userinfo and ID token both unusable: the step and statuses are reported, nothing else", async () => {
    const deps: PayPalDeps = {
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "CID", clientSecret: "SEC", sleep: async () => {},
      fetch: async (input) => (String(input).endsWith("/v1/oauth2/token") ? Response.json({ access_token: "AT" }) : new Response("", { status: 403 })),
    };
    expect(await identityFromCode(deps, "C", "https://s.test/r")).toMatchObject({ ok: false, error: { step: "userinfo", detail: "userinfo 403,403 no-idtoken scopes=openid:n,email:n,attrs:n,n=0" } });
  });

  it("AC-SEL-01-01/02: sign-in stores the payee and a 7-day session; signing in again keeps one seller", async () => {
    const db = sqliteD1();
    const repo = d1SessionRepo(db);
    const ids = fakeIds();
    const first = await signIn(repo, ids, who);
    const again = await signIn(repo, ids, { ...who, email: "new@seller.test" });
    expect(again.sellerId).toBe(first.sellerId);
    expect(again.sessionId).not.toBe(first.sessionId);
    const seller = await repo.sellerForSession(first.sessionId, ids.now().toISOString());
    expect(seller).toMatchObject({ id: first.sellerId, email: "new@seller.test", storeId: null });
    expect(await repo.sellerForSession(first.sessionId, new Date(ids.now().getTime() + 8 * 864e5).toISOString())).toBeNull();
    expect(await repo.sellerForSession("forged", ids.now().toISOString())).toBeNull();
  });

  it("NFR-SEC-04: the cookie is HttpOnly, Secure, SameSite=Lax, host-only, and reads back", () => {
    const c = cookie(SESSION_COOKIE, "abc", 604800);
    expect(c).toBe("__Host-shelf_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800");
    expect(readCookie(new Request("https://s.test", { headers: { cookie: `x=1; ${SESSION_COOKIE}=abc` } }), SESSION_COOKIE)).toBe("abc");
  });
});

describe("Store creation (TC-SEL-02)", () => {
  const setup = async () => {
    const db = sqliteD1();
    const ids = fakeIds();
    const { sellerId } = await signIn(d1SessionRepo(db), ids, who);
    const seller = { id: sellerId, email: who.email, name: who.name, storeId: null };
    return { db, ids, seller, stores: d1SellerStoreRepo(db) };
  };

  it("AC-SEL-01-03: link names are lower case letters, digits and hyphens", () => {
    expect(slugify("Maya's Mugs & Bowls!")).toBe("maya-s-mugs-bowls");
    expect(slugify("  Café  Crème ")).toBe("cafe-creme");
  });

  it("creates one store with shipping in cents", async () => {
    const s = await setup();
    const r = await createStore(s.stores, s.ids, s.seller, { name: "Maya Mugs", slug: "maya-mugs", shipping: 6, refund_policy: "Refunds within 14 days." });
    expect(r).toMatchObject({ ok: true, value: { slug: "maya-mugs", shippingCents: 600 } });
    expect((await s.stores.bySeller(s.seller.id))?.name).toBe("Maya Mugs");
  });

  it("FC-SEL-01-02: a taken link answers store.slug_taken with a free suggestion", async () => {
    const s = await setup();
    await createStore(s.stores, s.ids, s.seller, { name: "Maya Mugs", slug: "maya-mugs", shipping: 6 });
    const { sellerId } = await signIn(d1SessionRepo(s.db), s.ids, { ...who, accountId: "OTHER" });
    const r = await createStore(s.stores, s.ids, { ...s.seller, id: sellerId }, { name: "Maya Mugs", slug: "maya-mugs", shipping: 6 });
    expect(r).toMatchObject({ ok: false, error: { code: "store.slug_taken", suggestion: "maya-mugs-2" } });
  });

  it("refuses a bad link, a second store and bad shipping", async () => {
    const s = await setup();
    expect((await createStore(s.stores, s.ids, s.seller, { name: "X", slug: "Bad Slug", shipping: 1 })).ok).toBe(false);
    expect((await createStore(s.stores, s.ids, s.seller, { name: "X", slug: "ok-slug", shipping: -1 })).ok).toBe(false);
    await createStore(s.stores, s.ids, s.seller, { name: "A", slug: "first", shipping: 0 });
    expect(await createStore(s.stores, s.ids, s.seller, { name: "B", slug: "second", shipping: 0 })).toMatchObject({ ok: false, error: { code: "request.invalid" } });
  });
});
