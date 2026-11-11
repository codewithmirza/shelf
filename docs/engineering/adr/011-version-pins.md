# ADR-011 · Version pins read from npm on 11 Nov 2026

**Status.** Accepted, 11 Nov 2026. Supersedes the version lines of ADR-001 and ADR-002 and the Gate 3 stack table of 10 Nov.

**In one line.** Pin every core package to the exact version npm served on 11 Nov 2026, because the research of 10 Nov gave older peer ranges.

## Context
`npm view` on 11 Nov 2026 returned these facts:
- `@opennextjs/cloudflare@1.20.16` declares the peer `next >=15.5.29 <16 || >=16.4.5` and `wrangler ^4.148.0`. The 10 Nov pin (`next` 16.2) no longer satisfies it.
- `agents@0.33.0` declares the peers `@modelcontextprotocol/server 2.4.0` and `zod ^4.0.0`.
- `@modelcontextprotocol/ext-apps@2.0.4` exports `./server` (tool and resource helpers) and `./app-bridge` (host side), with the peer `@modelcontextprotocol/server ^2.0.0`.
- `typescript` latest is 7.0.2 (the native port). Next.js and the ESLint TypeScript parser are not verified on 7.

## Decision
| Package | Pin |
| --- | --- |
| `next` | 16.4.6 |
| `react`, `react-dom` | 19.3.1 |
| `@opennextjs/cloudflare` | 1.20.16 |
| `wrangler` | 4.160.0 |
| `agents` | 0.33.0 |
| `@modelcontextprotocol/server` | 2.4.0 |
| `@modelcontextprotocol/ext-apps` | 2.0.4 |
| `zod` | 4.6.7 |
| `drizzle-orm`, `drizzle-kit` | 0.45.4, 0.31.11 |
| `typescript` | 5.9 (latest 5.x) |

Pins are exact in `package.json`. An upgrade needs a new ADR.

## Consequences
- The OpenNext rules of ADR-001 still hold: no Edge runtime, no `proxy.ts`, no `cacheComponents` until checked on 16.4.
- TypeScript 7 waits until Next.js documents support.
