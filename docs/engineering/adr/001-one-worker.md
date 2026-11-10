# ADR-001 · One Cloudflare Worker for the web app and the backend, through OpenNext with a custom entry

**Status.** Proposed, 10 Nov 2026. The founder set the constraint (C-5).

**In one line.** Next.js runs on Workers through `@opennextjs/cloudflare`. A custom entry `src/worker.ts` sends `/mcp` to the MCP handler and everything else to Next.js, and also exports the queue consumer and the scheduled job.

## Context
- The founder wants frontend and backend in one Worker (C-5).
- `@opennextjs/cloudflare@1.20` supports Next.js `>=16.2.11` in 16.2 and needs the Node runtime. Open issues report problems with `proxy.ts` (#1277) and `cacheComponents` (#1130).
- The Workers Free plan allows 10 ms CPU per request and a 3 MiB gzip bundle. Paid allows 30 s CPU (up to 5 min) and 10 MiB.
- OpenNext documents a custom Worker entry that wraps `.open-next/worker.js`.

## Options
| | Custom entry (chosen) | MCP as a Next.js route handler `app/mcp/route.ts` | Two Workers (web, mcp) |
| --- | --- | --- | --- |
| One deploy | Yes | Yes | No |
| MCP passes through Next.js | No | Yes | No |
| Queue and cron handlers | In the same entry | Need a custom entry anyway | Split |
| Risk | Custom entry setup | Next.js request wrapping of streaming responses | Shared D1 and R2 bindings, two deploys |

## Decision
1. `wrangler.jsonc` sets `main: "src/worker.ts"`, `compatibility_flags: ["nodejs_compat"]`, `assets.directory: ".open-next/assets"`, and `limits.cpu_ms: 60000`.
2. `src/worker.ts` exports `fetch`, `queue` and `scheduled`. `fetch` routes `/mcp` to the MCP handler, else to the OpenNext handler.
3. Use the Workers Paid plan. Set `images.unoptimized: true` in `next.config.ts`.
4. Do not use `proxy.ts`, `cacheComponents` or the Edge runtime.

## Consequences
- If spike SPK-01 fails (bundle over 10 MiB or the entry does not route), fall back to two Workers that share D1 and R2. The domain code does not change.
