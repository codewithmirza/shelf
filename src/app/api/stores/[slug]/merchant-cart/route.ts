import { putCart } from "@/server/cart_api";
import { errorResponse, json, verifyCartCaller } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";

// POST /api/stores/{slug}/merchant-cart: create a cart (Cart API v1).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const v = await verifyCartCaller(request, (await params).slug);
  if (!v.ok) return v.response;
  const r = await putCart(checkoutDeps(v.env), v.caller, undefined, await request.json().catch(() => null));
  return r.ok ? json(r.value, 201) : errorResponse(r.error);
}
