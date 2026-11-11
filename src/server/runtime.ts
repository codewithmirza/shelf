import type { ShelfEnv } from "@/env";
import { d1Catalog } from "./catalog";
import { d1CartRepo } from "./carts";
import { d1OrderRepo, type CheckoutDeps } from "./checkout";
import { webIdSource } from "./domain/ids";
import type { ShelfMcpDeps } from "./mcp/server";
import { depsFromEnv as paypalDeps } from "./paypal/http";
import { captureOrder, createOrder } from "./paypal/orders";
import { VERSION } from "../version";

// The one place that turns Worker bindings into the ports the server code uses (CQ-26).
export function checkoutDeps(env: ShelfEnv): CheckoutDeps {
  const pp = paypalDeps(env);
  return {
    carts: d1CartRepo(env.DB),
    orders: d1OrderRepo(env.DB),
    payments: { createOrder: (input) => createOrder(pp, input), captureOrder: (id, key) => captureOrder(pp, id, key) },
    ids: webIdSource,
    tokenSecret: env.TOKEN_SECRET,
    origin: env.PUBLIC_ORIGIN,
  };
}

export function mcpDeps(env: ShelfEnv): ShelfMcpDeps {
  const checkout = checkoutDeps(env);
  return { catalog: d1Catalog(env.DB), carts: { repo: checkout.carts, ids: checkout.ids }, checkout, origin: env.PUBLIC_ORIGIN, version: VERSION };
}
