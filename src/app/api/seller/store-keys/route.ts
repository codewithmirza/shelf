import { webIdSource } from "@/server/domain/ids";
import { errorResponse, json, sellerContext } from "@/server/http";
import { createKey, listKeys } from "@/server/seller/keys";

// POST /api/seller/store-keys: 201 { key } shown once.
export async function POST(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  const r = await createKey(c.env.DB, webIdSource, c.storeId, await request.json().catch(() => null));
  return r.ok ? json({ key: r.value.key, store_key: r.value.row }, 201) : errorResponse(r.error);
}

export async function GET(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  return json({ store_keys: await listKeys(c.env.DB, c.storeId) });
}
