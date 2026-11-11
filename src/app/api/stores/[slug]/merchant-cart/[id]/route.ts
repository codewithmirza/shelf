import { getCart, putCart } from "@/server/cart_api";
import { errorResponse, json, verifyCartCaller } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const v = await verifyCartCaller(request, slug);
  if (!v.ok) return v.response;
  const r = await getCart(checkoutDeps(v.env), v.caller, id);
  return r.ok ? json(r.value) : errorResponse(r.error);
}

// PUT replaces the whole cart (SYS-CART-02).
export async function PUT(request: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const v = await verifyCartCaller(request, slug);
  if (!v.ok) return v.response;
  const r = await putCart(checkoutDeps(v.env), v.caller, id, await request.json().catch(() => null));
  return r.ok ? json(r.value) : errorResponse(r.error);
}
