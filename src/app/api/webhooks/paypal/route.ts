import { errorResponse, json, shelfEnv } from "@/server/http";
import { webhookDeps } from "@/server/runtime";
import { handleWebhook } from "@/server/webhooks";

// POST /api/webhooks/paypal. 400 if PayPal's signature check fails; 200 once applied or safely ignored.
// Any other failure answers 5xx so PayPal delivers the event again.
export async function POST(request: Request) {
  const r = await handleWebhook(webhookDeps(shelfEnv()), request.headers, await request.text());
  if (!r.ok) return errorResponse(r.error);
  return json({ ok: true, outcome: r.value.kind });
}
