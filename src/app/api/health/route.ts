import { json, shelfEnv } from "@/server/http";
import { accessToken, depsFromEnv } from "@/server/paypal/http";
import { VERSION } from "@/version";
import { depsFromEnv as vertexDeps, ping } from "@/server/model/vertex";

// GET /api/health: whether each outside service answers. Never returns a secret or an error body.
export async function GET(request: Request) {
  const env = shelfEnv();
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const hasVertex = Boolean(env.VERTEX_API_KEY || (env.CF_AIG_TOKEN && env.GCP_PROJECT && env.CF_ACCOUNT_ID));
  const [db, paypal] = await Promise.all([
    env.DB.prepare("SELECT 1 AS ok").first().then(() => "ok" as const, () => "fail" as const),
    env.PAYPAL_CLIENT_SECRET ? accessToken(depsFromEnv(env)).then((r) => (r.ok ? ("ok" as const) : ("fail" as const))) : Promise.resolve("missing" as const),
  ]);
  return json({
    version: VERSION,
    d1: db,
    paypal_sandbox: paypal,
    paypal_webhook_id: env.PAYPAL_WEBHOOK_ID ? "set" : "missing",
    token_secret: env.TOKEN_SECRET && env.TOKEN_SECRET.length >= 32 ? "set" : "missing",
    vertex: !hasVertex ? "missing" : !deep ? (env.VERTEX_API_KEY ? "set (api key)" : "set (ai gateway)") : await ping(vertexDeps(env)).then((r) => (r.ok ? "ok" : `fail ${r.status}`)),
  });
}
