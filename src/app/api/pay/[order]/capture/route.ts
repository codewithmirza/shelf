import { capturePayment } from "@/server/checkout";
import { errorResponse, json, shelfEnv } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";

// POST /api/pay/{order}/capture?t=: capture after the buyer approved in PayPal. Safe to call twice.
export async function POST(request: Request, { params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  const r = await capturePayment(checkoutDeps(shelfEnv()), order, new URL(request.url).searchParams.get("t") ?? "");
  return r.ok ? json({ state: r.value }) : errorResponse(r.error);
}
