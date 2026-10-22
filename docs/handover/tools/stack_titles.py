#!/usr/bin/env python3
"""Prefix stacked PR titles with their group and position, and keep a Stack
section at the top of each PR body. Safe to re-run: an existing prefix is
replaced, and only the marked section of a body is rewritten.

Usage: python3 docs/handover/tools/stack_titles.py [--apply]   (dry run without --apply)

Needs the GitHub CLI (`gh`), signed in with access to the repo. When a PR is
added to the stack, append its number to its group (or add a group at the
end) and run with --apply. When the stack merges, this is no longer needed.
"""
import json
import re
import subprocess
import sys
import tempfile
import time

REPO = "AbhimanyuPd/GCOS-personalization"

# The stack, bottom to top, in groups. Append a PR number to its group as it
# opens; a new group goes at the end.
GROUPS = [
    ("canvas", "Canvas features", [200, 201, 202, 205, 207, 209, 212, 213, 216, 217, 218, 220, 222, 226, 227, 229, 231, 234, 236, 238, 241, 242, 245, 246]),
    ("r1", "Refactor round 1 (#247)", [256, 257, 258, 259, 260, 261, 262, 263, 266, 267, 270, 271, 274, 275, 277, 279]),
    ("r2", "Refactor round 2 (#280)", [282, 284, 288, 289, 290, 292, 295, 296]),
    ("sel", "Shared selection (#280, option C)", [298, 300]),
    ("tip", "Tooltips (#280, option C)", [302]),
    ("names", "Name cleaner (#280, option A)", [304]),
    ("fixes", "Small fixes", [306, 308, 310]),
    ("r3", "Refactor round 3 (#311)", [315, 316, 317]),
    ("ci", "CI on every PR (#318)", [319]),
    ("plan", "Backend plan (#327)", [328, 329, 330, 331, 332, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346]),
]

PREFIX = re.compile(r"^\[[a-z0-9]+ \d+/\d+\] ")
START, END = "<!-- stack -->", "<!-- /stack -->"
SECTION = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n*", re.S)


def gh(*args: str, tries: int = 3) -> str:
    """Runs gh; an API call that fails now and then is tried again."""
    for attempt in range(tries):
        r = subprocess.run(["gh", *args, "--repo", REPO], capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"gh {' '.join(args[:2])} failed: {r.stderr.strip()}")


def pr(n: int) -> dict:
    return json.loads(gh("pr", "view", str(n), "--json", "title,body,state"))


def prefix(key: str, i: int, total: int) -> str:
    w = max(2, len(str(total))) if total >= 10 else 1
    return f"[{key} {i:0{w}d}/{total}] "


def section(gi: int, n: int, titles: dict[int, str]) -> str:
    key, name, nums = GROUPS[gi]
    lines = [START, f"**Stack: {name}, {nums.index(n) + 1} of {len(nums)}.** Merge from the bottom up; each PR's base is the one before it."]
    if gi > 0:
        prev = GROUPS[gi - 1]
        lines.append(f"Comes after **{prev[1]}** (ends with #{prev[2][-1]}).")
    lines.append("")
    for i, m in enumerate(nums, 1):
        mark = " ← **this PR**" if m == n else ""
        lines.append(f"{i}. #{m} {titles[m]}{mark}")
    if gi + 1 < len(GROUPS):
        nxt = GROUPS[gi + 1]
        lines += ["", f"Followed by **{nxt[1]}** (starts with #{nxt[2][0]})."]
    lines += [END, ""]
    return "\n".join(lines) + "\n"


def main() -> None:
    apply = "--apply" in sys.argv
    data = {n: pr(n) for _, _, nums in GROUPS for n in nums}
    bare = {n: PREFIX.sub("", d["title"]) for n, d in data.items()}
    for gi, (key, _, nums) in enumerate(GROUPS):
        for i, n in enumerate(nums, 1):
            d = data[n]
            if d["state"] != "OPEN":
                print(f"#{n}: {d['state']}, skipped")
                continue
            title = prefix(key, i, len(nums)) + bare[n]
            body = SECTION.sub("", d["body"] or "")
            body = section(gi, n, bare) + "\n" + body.lstrip("\n")
            changed = title != d["title"] or body != d["body"]
            print(f"#{n}: {title}{'' if changed else '  (unchanged)'}")
            if apply and changed:
                with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
                    f.write(body)
                gh("pr", "edit", str(n), "--title", title, "--body-file", f.name)


if __name__ == "__main__":
    main()
