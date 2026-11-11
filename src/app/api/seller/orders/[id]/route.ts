import { domainError } from "@/server/domain/errors";
import { errorResponse, json, sellerContext } from "@/server/http";
import { sellerOrder } from "@/server/refunds";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const o = await sellerOrder(c.env.DB, c.storeId, (await params).id);
  return o ? json({ order: o }) : errorResponse(domainError("not_found"));
}
