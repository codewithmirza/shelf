"""Compares the D1 migration with the Drizzle schema output: same tables, columns, types, NOT NULL and keys (Gate 4, M-02).
Usage: python3 scripts/check_schema.py db/migrations <drizzle-generated-dir>"""
import glob, sqlite3, sys

def load(folder):
    con = sqlite3.connect(":memory:")
    for f in sorted(glob.glob(folder + "/*.sql")):
        con.executescript(open(f).read().replace("--> statement-breakpoint", ""))
    tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '__drizzle%'")]
    out = {}
    for t in tables:
        cols = {r[1]: (r[2].upper(), r[3], r[5]) for r in con.execute(f"pragma table_info('{t}')")}
        # Compare what an index enforces (columns, uniqueness, partial), not its name: inline UNIQUE and a named unique index are equal.
        idx = sorted((tuple(c[2] for c in con.execute(f"pragma index_info('{r[1]}')")), r[2], r[4]) for r in con.execute(f"pragma index_list('{t}')") if r[3] != "pk")
        out[t] = (cols, idx)
    return out

a, b = load(sys.argv[1]), load(sys.argv[2])
problems = []
for t in sorted(set(a) | set(b)):
    if t not in a or t not in b:
        problems.append(f"table {t}: only in {'migration' if t in a else 'drizzle'}")
        continue
    ca, cb = a[t][0], b[t][0]
    for c in sorted(set(ca) | set(cb)):
        if ca.get(c) != cb.get(c):
            problems.append(f"{t}.{c}: migration={ca.get(c)} drizzle={cb.get(c)}")
    if a[t][1] != b[t][1]:
        problems.append(f"{t} indexes: migration={a[t][1]} drizzle={b[t][1]}")
print("\n".join(problems) if problems else f"schema match: {len(a)} tables")
sys.exit(1 if problems else 0)
