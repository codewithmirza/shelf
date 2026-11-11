import { errorResponse, json, sellerContext } from "@/server/http";
import { photoDeps } from "@/server/runtime";
import { blankDraft } from "@/server/seller/photos";

// "Fill in yourself" after a failed read (FC-SEL-02-02).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await blankDraft(photoDeps(c.env), c.storeId, (await params).id);
  return r.ok ? json({ product_id: r.value }, 201) : errorResponse(r.error);
}
