import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// A small D1 stand-in over Node's SQLite, with the real migrations applied. It lets the D1 adapters run
// their actual SQL in CI. Batches run in one transaction, as D1 does.
export function sqliteD1(seed = false): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  if (seed) db.exec(readFileSync("db/seed.sql", "utf8"));

  const isRead = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql);
  const make = (sql: string, args: unknown[] = []) => {
    const params = args.map((a) => (a === undefined ? null : a)) as SQLInputValue[];
    const exec = () => {
      const st = db.prepare(sql);
      if (isRead(sql)) return { results: st.all(...params) as unknown[], meta: { changes: 0 } };
      const r = st.run(...params);
      return { results: [] as unknown[], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    };
    const stmt = {
      bind: (...a: unknown[]) => make(sql, a),
      first: async <T>(col?: string) => {
        const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
        if (!row) return null;
        return (col ? row[col] : row) as T;
      },
      all: async <T>() => ({ results: db.prepare(sql).all(...params) as T[], success: true, meta: {} }),
      run: async () => ({ ...exec(), success: true }),
      raw: async () => db.prepare(sql).all(...params).map((r) => Object.values(r as object)),
      __exec: exec,
    };
    return stmt;
  };
  const d1 = {
    prepare: (sql: string) => make(sql),
    async batch(stmts: { __exec: () => unknown }[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.__exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    dump: async () => new ArrayBuffer(0),
    withSession: () => d1,
  };
  return d1 as unknown as D1Database;
}
