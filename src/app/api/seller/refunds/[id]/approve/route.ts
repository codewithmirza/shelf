import { errorResponse, json, sellerContext } from "@/server/http";
import { approveRefund } from "@/server/refunds";
import { sellerOrderDeps } from "@/server/runtime";

// The only way a refund is approved (INV-05): a signed-in seller, their own store.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await approveRefund(sellerOrderDeps(c.env), c.storeId, (await params).id);
  return r.ok ? json(r.value) : errorResponse(r.error);
}
