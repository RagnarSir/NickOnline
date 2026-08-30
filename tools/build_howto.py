#!/usr/bin/env python3
"""Generate HOWTO.md from src/help/guide.json.

The JSON is the single source: the in-app help panel renders it and this writes
the Markdown copy. Edit the JSON, then run:

    python3 tools/build_howto.py           # rewrite HOWTO.md
    python3 tools/build_howto.py --check   # exit 1 if HOWTO.md is out of date
"""

import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE = os.path.join(REPO, "src", "help", "guide.json")
OUT = os.path.join(REPO, "HOWTO.md")

BANNER = "<!-- Generated from src/help/guide.json by tools/build_howto.py — do not edit by hand. -->"


def render(guide):
    lines = [BANNER, "", f"# {guide['title']}", "", guide["intro"], ""]

    lines.append("## Contents")
    lines.append("")
    for s in guide["sections"]:
        anchor = s["heading"].lower().replace(" ", "-").replace(",", "").replace("'", "")
        lines.append(f"- [{s['heading']}](#{anchor})")
    lines.append("")

    for s in guide["sections"]:
        lines.append(f"## {s['heading']}")
        lines.append("")
        for b in s["blocks"]:
            t = b["type"]
            if t == "p":
                lines += [b["text"], ""]
            elif t == "note":
                lines += [f"> {b['text']}", ""]
            elif t == "steps":
                lines += [f"{i}. {item}" for i, item in enumerate(b["items"], 1)] + [""]
            elif t == "list":
                lines += [f"- {item}" for item in b["items"]] + [""]
            elif t == "table":
                lines.append("| " + " | ".join(b["head"]) + " |")
                lines.append("|" + "|".join(["---"] * len(b["head"])) + "|")
                for row in b["rows"]:
                    lines.append("| " + " | ".join(row) + " |")
                lines.append("")
            else:
                raise SystemExit(f"unknown block type: {t}")

    lines += ["---", "", f"*{guide['footer']}*", ""]
    return "\n".join(lines)


def main():
    with open(GUIDE) as f:
        guide = json.load(f)
    text = render(guide)

    if "--check" in sys.argv:
        current = open(OUT).read() if os.path.exists(OUT) else ""
        if current != text:
            print("HOWTO.md is out of date — run: python3 tools/build_howto.py")
            sys.exit(1)
        print("HOWTO.md is up to date")
        return

    with open(OUT, "w") as f:
        f.write(text)
    print("HOWTO.md  %d sections, %.1f KB" % (len(guide["sections"]), len(text) / 1024))


if __name__ == "__main__":
    main()
