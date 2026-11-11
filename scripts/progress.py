#!/usr/bin/env python3
"""Update docs/engineering/PROGRESS.md: set one board row and add one log line (AGENTS.md rule 15).

usage: scripts/progress.py T-11 "Title" "State" "Evidence" "Log text" [--next T-12 "Title"]
"""
import re, sys, datetime

PATH = "docs/engineering/PROGRESS.md"
task, title, state, evidence, log = sys.argv[1:6]
s = open(PATH).read()
board_head = "| Task | Title | State | Evidence |\n| --- | --- | --- | --- |\n"
log_head = "| When (IST) | Who | What |\n| --- | --- | --- |\n"
assert board_head in s and log_head in s, "PROGRESS.md headers changed"

def set_row(s, task, title, state, evidence):
    row = f"| {task} | {title} | {state} | {evidence} |"
    pre, rest = s.split(board_head, 1)
    body, post = rest.split("\n\n", 1)
    rows = [r for r in body.splitlines() if r.strip()]
    rows = [r for r in rows if not r.startswith(f"| {task} |")] + [row]
    rows.sort(key=lambda r: int(re.match(r"\| T-(\d+)", r).group(1)))
    return pre + board_head + "\n".join(rows) + "\n\n" + post

s = set_row(s, task, title, state, evidence)
if "--next" in sys.argv:
    i = sys.argv.index("--next")
    s = set_row(s, sys.argv[i + 1], sys.argv[i + 2], "Next", "—")
ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30))).strftime("%d %b %H:%M")
s = s.replace(log_head, log_head + f"| {ist} | Claude | {log} |\n", 1)
open(PATH, "w").write(s)
print(f"{task}: {state}")
