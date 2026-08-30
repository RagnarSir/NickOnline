#!/usr/bin/env python3
"""PostToolUse hook: keep the How-to in step with the features.

Reads the hook payload on stdin and does one of two things:

  * The guide itself was edited  -> regenerate HOWTO.md so the two never drift.
  * A user-facing surface was edited and the guide has not been touched since
    -> tell Claude the How-to may need a matching update.

Only ever advises; never blocks. A change to a component may or may not be
user-visible, and only a human or the model can judge that.
"""

import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE = os.path.join(REPO, "src", "help", "guide.json")
BUILDER = os.path.join(REPO, "tools", "build_howto.py")

# Editing any of these can change what a user sees, and so what the How-to says.
WATCHED_DIRS = (
    os.path.join(REPO, "src", "components"),
    os.path.join(REPO, "src", "store"),
)
WATCHED_FILES = (
    os.path.join(REPO, "src", "App.tsx"),
    os.path.join(REPO, "src", "engine", "types.ts"),
    os.path.join(REPO, "src", "share.ts"),
)


def emit(payload):
    print(json.dumps(payload))
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    path = (data.get("tool_input") or {}).get("file_path") or ""
    path = (data.get("tool_response") or {}).get("filePath") or path
    if not path:
        sys.exit(0)
    path = os.path.abspath(path)

    # The guide changed: rebuild its Markdown twin.
    if path == GUIDE:
        r = subprocess.run([sys.executable, BUILDER], capture_output=True, text=True)
        if r.returncode == 0:
            emit({"systemMessage": "HOWTO.md regenerated from guide.json", "suppressOutput": True})
        sys.exit(0)

    watched = path in WATCHED_FILES or any(
        path.startswith(d + os.sep) for d in WATCHED_DIRS
    )
    if not watched or not os.path.exists(GUIDE):
        sys.exit(0)

    # Stale only if the guide predates this change. Editing the guide in the same
    # session clears the warning for every later edit.
    if os.path.getmtime(GUIDE) >= os.path.getmtime(path):
        sys.exit(0)

    rel = os.path.relpath(path, REPO)
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    f"{rel} changed but src/help/guide.json has not been updated. "
                    "If this changed anything a user sees — a control, a label, a "
                    "workflow, a result — update the matching section of guide.json "
                    "(HOWTO.md and the in-app How to use panel both regenerate from "
                    "it). If the change is purely internal, no action is needed."
                ),
            }
        }
    )


if __name__ == "__main__":
    main()
