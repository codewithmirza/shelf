import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ShelfEnv } from "@/env";
import { ERROR_INFO, type DomainError } from "./domain/errors";

// Bindings for a Next.js route on the Worker.
export const shelfEnv = (): ShelfEnv => getCloudflareContext().env as unknown as ShelfEnv;

// One shape for every API error: the Gate 5 code and screen text. The detail stays in the log (CQ-32, CQ-33).
export function errorResponse(e: DomainError): Response {
  const { status, message } = ERROR_INFO[e.code];
  console.log(JSON.stringify({ level: "warn", code: e.code, detail: e.detail ?? null }));
  return Response.json({ error: { code: e.code, message } }, { status, headers: { "cache-control": "no-store" } });
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
