#!/usr/bin/env python3
"""Writes the handover's PR and issue index from GitHub.

Usage: python3 docs/handover/tools/handover_index.py docs/handover/index.md
"""
import json, re, subprocess, sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from stack_titles import GROUPS, PREFIX, REPO

def gh(*a):
    return json.loads(subprocess.run(["gh", *a, "--repo", REPO], capture_output=True, text=True, check=True).stdout)

prs = {p["number"]: p for p in gh("pr", "list", "--state", "all", "--limit", "300", "--json", "number,title,headRefName,baseRefName,state,closingIssuesReferences")}
issues = gh("issue", "list", "--state", "all", "--limit", "300", "--json", "number,title,state,labels")

out = ["# Pull requests and issues", "",
       "Generated from GitHub for the handover. Every PR below is **open and unmerged**; each one's base is the PR before it, so they merge **in this order, bottom up**.", ""]
order = 0
for key, name, nums in GROUPS:
    out += [f"## {name} (`{key}`)", "", "| # | PR | Branch | Issue |", "|---|---|---|---|"]
    for n in nums:
        order += 1
        p = prs[n]
        title = PREFIX.sub("", p["title"]).replace("|", "\\|")
        # The issue each PR implements, from its title: GitHub links closing
        # keywords only on PRs into the default branch, which in a stack is
        # just the bottom one.
        m = re.search(r"\(#(\d+)\)$", title)
        closes = f"#{m.group(1)}" if m else "–"
        out.append(f"| {order} | #{n} {title} | `{p['headRefName']}` | {closes} |")
    out.append("")

open_issues = [i for i in issues if i["state"] == "OPEN"]
out += ["## Open issues", "", f"{len(open_issues)} open. Most are implemented by a PR above (its **Issue** column); see the handover README on closing them as the stack merges.", "", "| Issue | Labels |", "|---|---|"]
for i in sorted(open_issues, key=lambda i: i["number"]):
    labels = ", ".join(l["name"] for l in i["labels"]) or "–"
    out.append(f"| #{i['number']} {i['title'].replace('|', chr(92) + '|')} | {labels} |")
out.append("")
open(sys.argv[1], "w").write("\n".join(out))
print(f"{order} PRs, {len(open_issues)} open issues")
