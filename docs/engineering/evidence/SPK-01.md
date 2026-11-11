# SPK-01 · Next.js, MCP, queue and cron in one Worker

**Date.** 11 Nov 2026, 07:10 IST. **Who.** Claude. **Result.** Pass locally. Live deploy waits for setup step S-02.

| Check | Command | Result |
| --- | --- | --- |
| OpenNext build | `pnpm opennextjs-cloudflare build` | `OpenNext build complete.` |
| Bundle size | `wrangler deploy --dry-run` | `Total Upload: 4691.29 KiB / gzip: 972.32 KiB` (limit 10 MiB on Workers Paid) |
| Next.js page through the Worker | `wrangler dev`, `GET /` | 200, landing headline rendered |
| MCP on the same Worker | `POST /mcp` `initialize` (protocol 2025-11-25) | 200, `serverInfo.name = "shelf"`, instructions returned |
| Queue and cron handlers | `src/worker.ts` exports `queue` and `scheduled` | Type-checks; bodies come in T-11 and T-16 |

Versions: next 16.4.6, @opennextjs/cloudflare 1.20.16, wrangler 4.160.0, agents 0.33.0, @modelcontextprotocol/server 2.4.0 (ADR-011).

Not yet checked: `wrangler deploy` to Cloudflare (needs S-02).
