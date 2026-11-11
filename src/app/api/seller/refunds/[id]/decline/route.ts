import { errorResponse, json, sellerContext } from "@/server/http";
import { declineRefund } from "@/server/refunds";
import { sellerOrderDeps } from "@/server/runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await declineRefund(sellerOrderDeps(c.env), c.storeId, (await params).id, await request.json().catch(() => null));
  return r.ok ? json(r.value) : errorResponse(r.error);
}
