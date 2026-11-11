import { errorResponse, json, sellerContext } from "@/server/http";
import { photoDeps } from "@/server/runtime";
import { listPhotos, uploadPhotos } from "@/server/seller/photos";

// POST /api/seller/photos: multipart, 1 to 10 images (SYS-SEL-03). 202: they are read in the background.
export async function POST(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => typeof f !== "string");
  const r = await uploadPhotos(photoDeps(c.env), c.storeId, files.map((f) => ({ type: f.type, size: f.size, bytes: () => f.arrayBuffer() })));
  return r.ok ? json({ photos: r.value }, 202) : errorResponse(r.error);
}

// GET /api/seller/photos?since=: the Seller app polls this while photos are read.
export async function GET(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const photos = await listPhotos(c.env.DB, c.storeId, new URL(request.url).searchParams.get("since"));
  return json({ photos: photos.map((p) => ({ id: p.id, state: p.state, product_id: p.productId, failure_reason: p.failureReason, created_at: p.createdAt })) });
}
