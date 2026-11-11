import type { ShelfEnv } from "@/env";
import { d1Catalog } from "./catalog";
import { d1CartRepo } from "./carts";
import { d1OrderRepo, type CheckoutDeps } from "./checkout";
import { webIdSource } from "./domain/ids";
import type { ShelfMcpDeps } from "./mcp/server";
import { depsFromEnv as paypalDeps } from "./paypal/http";
import { addTracking, captureOrder, createOrder, getOrder } from "./paypal/orders";
import { refundCapture } from "./paypal/refunds";
import { VERSION } from "../version";
import { domainError } from "./domain/errors";
import { err, ok } from "./domain/result";
import { verifyWebhook } from "./paypal/webhooks";
import { d1WebhookRepo, type WebhookDeps } from "./webhooks";
import { d1OrderStatusRepo } from "./orders";

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
  return {
    catalog: d1Catalog(env.DB),
    carts: { repo: checkout.carts, ids: checkout.ids },
    checkout,
    orders: { repo: d1OrderStatusRepo(env.DB), ids: checkout.ids, tokenSecret: env.TOKEN_SECRET },
    origin: env.PUBLIC_ORIGIN,
    version: VERSION,
  };
}

export function webhookDeps(env: ShelfEnv): WebhookDeps {
  const pp = paypalDeps(env);
  return {
    ...checkoutDeps(env),
    webhooks: d1WebhookRepo(env.DB),
    async verify(headers, original) {
      const r = await verifyWebhook(pp, env.PAYPAL_WEBHOOK_ID, headers, original);
      // A refused signature is the caller's fault (400); PayPal not answering is ours (502), so PayPal retries.
      if (r.ok) return ok(true);
      return r.error.code === "request.invalid" || r.error.code === "paypal.refused" ? err(domainError("request.invalid", r.error.detail)) : err(r.error);
    },
  };
}

export function sellerOrderDeps(env: ShelfEnv): import("./refunds").SellerOrderDeps {
  const pp = paypalDeps(env);
  return {
    db: env.DB,
    ids: webIdSource,
    paypal: {
      addTracking: (i) => addTracking(pp, { ...i, paypalOrderId: i.paypalOrderId as never, captureId: i.captureId as never }),
      refund: (capture, amount, key) => refundCapture(pp, capture as never, amount, key),
    },
  };
}

export function photoDeps(env: ShelfEnv): import("./seller/photos").PhotoDeps {
  return { db: env.DB, bucket: env.PHOTOS, ids: webIdSource, queue: { send: async (body) => { await env.EXTRACTION_QUEUE.send(body); } } };
}
