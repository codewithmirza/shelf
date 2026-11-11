import { errorResponse, json, nowIso, sellerContext } from "@/server/http";
import { moveProduct } from "@/server/seller/products";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await moveProduct(c.env.DB, c.storeId, (await params).id, "deleted", nowIso());
  return r.ok ? json({ product: r.value }) : errorResponse(r.error);
}
