import { checkoutCart } from "@/server/cart_api";
import { errorResponse, json, verifyCartCaller } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";

// POST /checkout: {} creates the PayPal order and answers approve_url; { paypal_order_id } captures.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const v = await verifyCartCaller(request, slug);
  if (!v.ok) return v.response;
  const text = await request.text();
  let body: unknown = {};
  if (text.trim()) { try { body = JSON.parse(text); } catch { body = null; } }
  const r = await checkoutCart(checkoutDeps(v.env), v.caller, id, body);
  return r.ok ? json(r.value) : errorResponse(r.error);
}
