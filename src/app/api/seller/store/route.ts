import { ERROR_INFO, domainError } from "@/server/domain/errors";
import { webIdSource } from "@/server/domain/ids";
import { currentSeller, errorResponse, json, shelfEnv } from "@/server/http";
import { createStore, d1SellerStoreRepo } from "@/server/seller/stores";

export async function POST(request: Request) {
  const env = shelfEnv();
  const seller = await currentSeller(request, env);
  if (!seller) return errorResponse(domainError("auth.required"));
  const r = await createStore(d1SellerStoreRepo(env.DB), webIdSource, seller, await request.json().catch(() => null));
  if (!r.ok) {
    if (r.error.code === "store.slug_taken") return json({ error: { code: r.error.code, message: `${ERROR_INFO["store.slug_taken"].message} Try ${r.error.suggestion}.`, suggestion: r.error.suggestion } }, 409);
    return errorResponse(r.error);
  }
  return json({ store: r.value }, 201);
}

export async function GET(request: Request) {
  const env = shelfEnv();
  const seller = await currentSeller(request, env);
  if (!seller) return errorResponse(domainError("auth.required"));
  const store = await d1SellerStoreRepo(env.DB).bySeller(seller.id);
  return store ? json({ store }) : errorResponse(domainError("not_found", "no store yet"));
}
