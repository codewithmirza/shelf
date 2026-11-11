import { publicPhoto } from "@/server/seller/photos";
import { shelfEnv } from "@/server/http";

// GET /photos/{key}: a photo of a published product, for the Storefront and the store page.
// Draft photos are never public. (Change from Gate 5 "signed t, exp": publication is the gate; see PROGRESS.)
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const env = shelfEnv();
  const key = decodeURIComponent((await params).key);
  if (!/^stores\/sto_[0-9A-Z]+\/pho_[0-9A-Z]+\.(jpg|png|webp|heic)$/.test(key) || !(await publicPhoto(env.DB, key))) return new Response("Not found.", { status: 404 });
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("Not found.", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "public, max-age=3600" } });
}
