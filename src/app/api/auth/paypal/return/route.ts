import { identityFromCode } from "@/server/auth/paypal_login";
import { SESSION_COOKIE, SESSION_TTL_S, STATE_COOKIE, cookie, d1SessionRepo, readCookie, signIn } from "@/server/auth/session";
import { webIdSource } from "@/server/domain/ids";
import { shelfEnv } from "@/server/http";
import { depsFromEnv } from "@/server/paypal/http";
import { d1SellerStoreRepo } from "@/server/seller/stores";

const back = (path: string, extra: string[] = []) => {
  const headers = new Headers({ location: path, "cache-control": "no-store" });
  headers.append("set-cookie", cookie(STATE_COOKIE, "", 0));
  for (const c of extra) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
};

// GET /api/auth/paypal/return: checks `state`, exchanges the code, creates the session.
// A new seller goes to "Name your store"; a returning one to their store (AC-SEL-01-01, -02).
export async function GET(request: Request) {
  const env = shelfEnv();
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const log = (why: string, detail?: string) => console.log(JSON.stringify({ level: "warn", route: "auth.return", why, detail: detail ?? null }));
  if (url.searchParams.get("error")) { log("paypal_error", url.searchParams.get("error") ?? ""); return back("/app?signin=cancelled"); }
  if (!state || state !== readCookie(request, STATE_COOKIE)) { log("state", state ? "mismatch" : "missing"); return back("/app?signin=failed&why=state"); }
  if (!code) return back("/app?signin=cancelled");
  const who = await identityFromCode(depsFromEnv(env), code, `${env.PUBLIC_ORIGIN}/api/auth/paypal/return`);
  // The short detail (HTTP statuses only) helps diagnose; it holds no token or personal data.
  if (!who.ok) { log(who.error.step, who.error.detail); return back(`/app?signin=failed&why=${who.error.step}&d=${encodeURIComponent((who.error.detail ?? "").slice(0, 240))}`); }
  const { sessionId, sellerId } = await signIn(d1SessionRepo(env.DB), webIdSource, who.value);
  const store = await d1SellerStoreRepo(env.DB).bySeller(sellerId);
  return back(store ? "/app" : "/app/new-store", [cookie(SESSION_COOKIE, sessionId, SESSION_TTL_S)]);
}
