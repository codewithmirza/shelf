import { describe, expect, it } from "vitest";
import { LIMITS, checkCaller, checkRate, d1RateStore, sweepRateLimits } from "@/server/ratelimit";
import { sqliteD1 } from "../support/d1";

const SECRET = "test-secret-test-secret-test-secret-1234";

describe("MCP guard (TC-MCP-06, THR-09)", () => {
  it("TC-MCP-06: the 301st call in a minute from one address gets 429; another address is unaffected", async () => {
    const store = d1RateStore(sqliteD1());
    const now = new Date("2026-11-11T10:00:05Z");
    for (let i = 0; i < LIMITS.mcp.max; i++) expect((await checkRate(store, LIMITS.mcp, "203.0.113.7", SECRET, now)).allowed).toBe(true);
    expect(await checkRate(store, LIMITS.mcp, "203.0.113.7", SECRET, now)).toEqual({ allowed: false, retryAfterS: 55 });
    expect((await checkRate(store, LIMITS.mcp, "198.51.100.1", SECRET, now)).allowed).toBe(true);
    // The next window starts fresh.
    expect((await checkRate(store, LIMITS.mcp, "203.0.113.7", SECRET, new Date("2026-11-11T10:01:00Z"))).allowed).toBe(true);
  });

  it("no raw address is stored, and the sweep deletes ended windows", async () => {
    const db = sqliteD1();
    await checkRate(d1RateStore(db), LIMITS.mcp, "203.0.113.7", SECRET, new Date("2026-11-11T10:00:05Z"));
    const rows = (await db.prepare("SELECT bucket FROM rate_limits").all<{ bucket: string }>()).results;
    expect(rows[0]!.bucket).toMatch(/^mcp:[0-9a-f]{24}:\d+$/);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
    expect(await sweepRateLimits(db, new Date("2026-11-11T10:02:00Z"))).toBe(1);
  });

  it("TC-MCP-06: a wrong host or a foreign browser origin is refused", () => {
    const own = "https://shelf.example.workers.dev";
    const req = (url: string, origin?: string) => new Request(url, { method: "POST", headers: origin ? { origin } : {} });
    expect(checkCaller(req(`${own}/mcp`), own)).toBe("ok");
    expect(checkCaller(req(`${own}/mcp`, own), own)).toBe("ok");
    expect(checkCaller(req("https://evil.test/mcp"), own)).toBe("wrong_host");
    expect(checkCaller(req(`${own}/mcp`, "https://evil.test"), own)).toBe("wrong_origin");
    // Sandboxed iframes send Origin "null"; they reach /mcp only through their host anyway.
    expect(checkCaller(req(`${own}/mcp`, "null"), own)).toBe("ok");
  });
});
