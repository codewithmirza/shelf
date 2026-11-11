import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ShelfEnv } from "@/env";
import { ERROR_INFO, type DomainError } from "./domain/errors";

// Bindings for a Next.js route on the Worker.
export const shelfEnv = (): ShelfEnv => getCloudflareContext().env as unknown as ShelfEnv;

// One shape for every API error: the Gate 5 code and screen text. The detail stays in the log (CQ-32, CQ-33).
export function errorResponse(e: DomainError): Response {
  const { status, message } = ERROR_INFO[e.code];
  console.log(JSON.stringify({ level: "warn", code: e.code, detail: e.detail ?? null }));
  return Response.json({ error: { code: e.code, message } }, { status, headers: { "cache-control": "no-store" } });
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// The signed-in seller, or null. Every Seller app route starts here (SYS-SEL-02).
export async function currentSeller(request: Request, env: ShelfEnv) {
  const { d1SessionRepo, readCookie, SESSION_COOKIE } = await import("./auth/session");
  const id = readCookie(request, SESSION_COOKIE);
  return id ? d1SessionRepo(env.DB).sellerForSession(id, new Date().toISOString()) : null;
}

// Every Seller app route: the seller from the session and their store. Missing either answers like the
// contract says: 401 with no session, 404 with no store (SYS-SEL-02).
export async function sellerContext(request: Request): Promise<{ ok: true; env: ShelfEnv; sellerId: string; storeId: import("./domain/brand").StoreId } | { ok: false; response: Response }> {
  const env = shelfEnv();
  const seller = await currentSeller(request, env);
  if (!seller) return { ok: false, response: errorResponse({ code: "auth.required" }) };
  if (!seller.storeId) return { ok: false, response: errorResponse({ code: "not_found", detail: "no store yet" }) };
  return { ok: true, env, sellerId: seller.id, storeId: seller.storeId };
}

export const nowIso = () => new Date().toISOString();
