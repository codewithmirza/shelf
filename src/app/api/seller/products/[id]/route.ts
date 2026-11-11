import { domainError } from "@/server/domain/errors";
import { errorResponse, json, nowIso, sellerContext } from "@/server/http";
import { editProduct, getProduct } from "@/server/seller/products";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const p = await getProduct(c.env.DB, c.storeId, (await params).id);
  return p ? json({ product: p }) : errorResponse(domainError("not_found"));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await editProduct(c.env.DB, c.storeId, (await params).id, await request.json().catch(() => null), nowIso());
  return r.ok ? json({ product: r.value }) : errorResponse(r.error);
}
