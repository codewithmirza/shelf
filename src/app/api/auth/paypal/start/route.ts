import { STATE_COOKIE, cookie, randomToken } from "@/server/auth/session";
import { authorizeUrl } from "@/server/auth/paypal_login";
import { webIdSource } from "@/server/domain/ids";
import { shelfEnv } from "@/server/http";

// GET /api/auth/paypal/start: 302 to PayPal with a fresh `state`, kept in a 10-minute cookie (AC-SEL-01-04).
export async function GET() {
  const env = shelfEnv();
  const state = randomToken(webIdSource);
  const headers = new Headers({ location: authorizeUrl(env.PAYPAL_BASE, env.PAYPAL_CLIENT_ID, `${env.PUBLIC_ORIGIN}/api/auth/paypal/return`, state), "cache-control": "no-store" });
  headers.append("set-cookie", cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers });
}
