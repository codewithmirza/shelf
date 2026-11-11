import type { ShelfEnv } from "@/env";
import { d1Catalog } from "./catalog";
import { d1CartRepo } from "./carts";
import { d1OrderRepo, type CheckoutDeps } from "./checkout";
import { webIdSource } from "./domain/ids";
import type { ShelfMcpDeps } from "./mcp/server";
import { depsFromEnv as paypalDeps } from "./paypal/http";
import { captureOrder, createOrder, getOrder } from "./paypal/orders";
import { VERSION } from "../version";
import { domainError } from "./domain/errors";
import { err, ok } from "./domain/result";
import { verifyWebhook } from "./paypal/webhooks";
import { d1WebhookRepo, type WebhookDeps } from "./webhooks";

// The one place that turns Worker bindings into the ports the server code uses (CQ-26).
export function checkoutDeps(env: ShelfEnv): CheckoutDeps {
  const pp = paypalDeps(env);
  return {
    carts: d1CartRepo(env.DB),
    orders: d1OrderRepo(env.DB),
    payments: { createOrder: (input) => createOrder(pp, input), captureOrder: (id, key) => captureOrder(pp, id, key), getOrder: (id) => getOrder(pp, id) },
    ids: webIdSource,
    tokenSecret: env.TOKEN_SECRET,
    origin: env.PUBLIC_ORIGIN,
  };
}

export function mcpDeps(env: ShelfEnv): ShelfMcpDeps {
  const checkout = checkoutDeps(env);
  return { catalog: d1Catalog(env.DB), carts: { repo: checkout.carts, ids: checkout.ids }, checkout, origin: env.PUBLIC_ORIGIN, version: VERSION };
}

export function webhookDeps(env: ShelfEnv): WebhookDeps {
  const pp = paypalDeps(env);
  return {
    ...checkoutDeps(env),
    webhooks: d1WebhookRepo(env.DB),
    async verify(headers, event) {
      const r = await verifyWebhook(pp, env.PAYPAL_WEBHOOK_ID, headers, event);
      // A refused signature is the caller's fault (400); PayPal not answering is ours (502), so PayPal retries.
      if (r.ok) return ok(true);
      return r.error.code === "request.invalid" || r.error.code === "paypal.refused" ? err(domainError("request.invalid", r.error.detail)) : err(r.error);
    },
  };
}
