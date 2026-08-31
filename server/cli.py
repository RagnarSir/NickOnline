"""Operator commands. Run on the VPS with NICKONLINE_DATA_DIR set.

    python -m cli initdb
    python -m cli promote <username>
    python -m cli users

`promote` exists instead of RagCheat's first-run /setup page: signup here is
open, so a self-disabling "first user becomes admin" page would be a land grab —
anyone who found the URL between the deploy and your sign-up would own the
instance. Promotion goes through ssh, which is already the trust boundary.
"""

from __future__ import annotations

import sys

from app import app
from db import db, init_db


def _promote(username: str) -> int:
    with app.app_context():
        cur = db().execute(
            "UPDATE users SET role = 'admin' WHERE username = ?", (username.strip().lower(),)
        )
        db().commit()
        if cur.rowcount == 0:
            print(f"No user named {username!r}. Sign up in the app first.")
            return 1
        print(f"{username} is now an admin.")
        return 0


def _users() -> int:
    with app.app_context():
        rows = db().execute(
            "SELECT u.username, u.role, u.disabled, g.name AS grp FROM users u"
            " JOIN groups g ON g.id = u.group_id ORDER BY u.created_at"
        ).fetchall()
        if not rows:
            print("No users yet.")
        for r in rows:
            flag = " (disabled)" if r["disabled"] else ""
            print(f"{r['username']:<20} {r['role']:<6} group={r['grp']}{flag}")
        return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "initdb":
        init_db()
        print("Schema ready.")
        return 0
    if cmd == "promote" and len(argv) == 3:
        return _promote(argv[2])
    if cmd == "users":
        return _users()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
