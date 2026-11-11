import { domainError } from "@/server/domain/errors";
import { errorResponse, sellerContext } from "@/server/http";
import { photoById } from "@/server/seller/photos";

// A seller's own photo, drafts included. Another store's photo reads as not found (INV-10).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const photo = await photoById(c.env.DB, (await params).id);
  if (!photo || photo.storeId !== c.storeId) return errorResponse(domainError("not_found"));
  const obj = await c.env.PHOTOS.get(photo.r2Key);
  if (!obj) return errorResponse(domainError("not_found"));
  return new Response(obj.body, { headers: { "content-type": photo.contentType, "cache-control": "private, max-age=3600" } });
}
