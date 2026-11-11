#!/usr/bin/env python3
"""DoD-01 traceability: every Unit, Integration or Contract test case in Gate 6 has a test that names its ID.
E2E, performance and live checks are listed as evidence-only and do not fail the check."""
import re, sys, pathlib

rows = re.findall(r"^\| (TC-[A-Z0-9]+-\d+) \| [^|]* \| (\w+) \|", pathlib.Path("docs/engineering/06-quality-contract.md").read_text(), re.M)
code = "\n".join(p.read_text() for p in pathlib.Path("tests").rglob("*.ts"))
missing, evidence = [], []
for tc, kind in rows:
    found = re.search(rf"\b{re.escape(tc)}\b", code)
    if kind in ("Unit", "Integration", "Contract") and not found:
        missing.append(f"{tc} ({kind})")
    elif not found:
        evidence.append(f"{tc} ({kind})")
print(f"trace: {len(rows)} test cases; {len(rows) - len(missing) - len(evidence)} named in tests")
if evidence:
    print("evidence-only (live, E2E, perf):", ", ".join(evidence))
if missing:
    print("MISSING:", ", ".join(missing))
    sys.exit(1)
