#!/usr/bin/env python3
"""Stop hook: say so if work is sitting uncommitted.

`deploy.py` commits and pushes as part of shipping, so anything deployed is
already on GitHub. This catches the other case — a session that changed things
without deploying — so the repo never quietly falls behind.

Advisory only. It never commits anything itself; pushing to a public repo is not
something to do behind the user's back.
"""

import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True, timeout=10
    )


def main():
    if not os.path.isdir(os.path.join(REPO, ".git")):
        return

    dirty = git("status", "--porcelain").stdout.strip()
    ahead = git("rev-list", "--count", "@{u}..HEAD").stdout.strip()

    parts = []
    if dirty:
        n = len(dirty.splitlines())
        parts.append(f"{n} uncommitted file{'s' if n != 1 else ''}")
    if ahead.isdigit() and int(ahead) > 0:
        parts.append(f"{ahead} commit{'s' if ahead != '1' else ''} not pushed")

    if parts:
        print(json.dumps({
            "systemMessage": (
                "NickOnline: " + " and ".join(parts) + " — not on GitHub yet. "
                "`python3 deploy.py` ships and pushes together."
            )
        }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # never let a reminder break a session
