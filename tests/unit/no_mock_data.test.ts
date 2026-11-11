import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AGENTS.md rule 11: no mock data. Migrations shape tables; they never insert rows. Invented records live in tests/fixtures only.
describe("No mock data (AGENTS.md rule 11)", () => {
  it("db/ holds migrations only, and no migration inserts rows", () => {
    expect(readdirSync("db").sort()).toEqual(["migrations"]);
    for (const f of readdirSync("db/migrations")) expect(readFileSync(`db/migrations/${f}`, "utf8")).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("no script loads the test fixture into a database", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    for (const cmd of Object.values(pkg.scripts)) expect(cmd).not.toMatch(/fixtures|seed/);
  });
});
