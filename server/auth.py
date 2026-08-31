"""Sessions, identity, and the guards every route hangs off.

The design rule that matters: the session cookie carries only a user id and a
password version. The *group* is read from the database on every request, never
from the cookie and never from the request body. A cookie that carried a group
id would keep writing into the old group after an admin moved the user — a bug
that would take weeks to notice and would silently cross the one boundary this
feature exists to defend.
"""

from __future__ import annotations

import sqlite3
import time
from functools import wraps

from flask import current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import db, new_public_id

MIN_PASSWORD_LEN = 8
MAX_USERNAME_LEN = 32


def now_ms() -> int:
    return int(time.time() * 1000)


def norm(username: str) -> str:
    return (username or "").strip().lower()


def valid_username(name: str) -> str | None:
    """Return an error message, or None when the name is acceptable."""
    if not name:
        return "Username is required"
    if len(name) > MAX_USERNAME_LEN:
        return f"Username must be at most {MAX_USERNAME_LEN} characters"
    if not all(c.isalnum() or c in "_-." for c in name):
        return "Username may use letters, digits, and _ - . only"
    return None


def valid_password(pw: str) -> str | None:
    if not pw or len(pw) < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters"
    return None


def client_ip() -> str:
    """The address nginx observed, not the one the client claims.

    nginx sets X-Forwarded-For with $proxy_add_x_forwarded_for, which *appends*
    the real peer to whatever the client sent. So the rightmost entry is the one
    hop we trust and the only one a client cannot spoof.
    """
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[-1].strip()
    return request.remote_addr or ""


def record_event(event: str, username: str | None = None, user_id: int | None = None) -> None:
    """Append to the login audit log. Best-effort: a logging failure must never
    block a real login."""
    try:
        db().execute(
            "INSERT INTO login_events (ts, username, user_id, event, ip, user_agent)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (now_ms(), username, user_id, event, client_ip(),
             request.headers.get("User-Agent", "")[:300]),
        )
        db().commit()
    except Exception:  # noqa: BLE001 — auditing is never worth failing a request over
        pass


# ── password + user records ──────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return generate_password_hash(pw)


def create_user(username: str, password: str, role: str = "user") -> tuple[dict | None, str | None]:
    """Create a user and their personal group in one transaction.

    Signup always yields a usable account: there is no groupless state to handle
    anywhere else in the system, because users.group_id is NOT NULL from the
    first instant the row exists.
    """
    name = norm(username)
    err = valid_username(name) or valid_password(password)
    if err:
        return None, err
    if role not in ("admin", "user"):
        return None, "Invalid role"

    conn = db()
    ts = now_ms()
    try:
        with conn:  # one transaction; a failure leaves no orphan group
            if conn.execute("SELECT 1 FROM users WHERE username = ?", (name,)).fetchone():
                return None, "That username is taken"
            cur = conn.execute(
                "INSERT INTO groups (public_id, name, kind, created_at) VALUES (?, ?, 'personal', ?)",
                (new_public_id(), name, ts),
            )
            gid = cur.lastrowid
            cur = conn.execute(
                "INSERT INTO users (public_id, username, password_hash, role, group_id,"
                " personal_group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (new_public_id(), name, hash_password(password), role, gid, gid, ts),
            )
            uid = cur.lastrowid
    except sqlite3.IntegrityError:
        # Only a constraint violation means the name went already. Catching
        # everything here once turned a missing table into "username is taken",
        # which sent a real fault back as ordinary user error.
        return None, "That username is taken"

    return load_user_row(uid), None


def load_user_row(uid: int) -> dict | None:
    row = db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return dict(row) if row else None


def verify(username: str, password: str) -> dict | None:
    """Return the user record on success, else None."""
    row = db().execute("SELECT * FROM users WHERE username = ?", (norm(username),)).fetchone()
    if row and check_password_hash(row["password_hash"], password or ""):
        return dict(row)
    return None


def set_password(uid: int, password: str) -> str | None:
    """Change a password and bump pw_version, which invalidates every session
    carrying the old value — including sessions on other devices."""
    err = valid_password(password)
    if err:
        return err
    db().execute(
        "UPDATE users SET password_hash = ?, pw_version = pw_version + 1 WHERE id = ?",
        (hash_password(password), uid),
    )
    db().commit()
    return None


# ── session ──────────────────────────────────────────────────────────────────

def start_session(user: dict) -> None:
    session.clear()  # session-fixation defence
    session["uid"] = user["id"]
    session["pwv"] = user["pw_version"]
    session.permanent = True


def end_session() -> None:
    session.clear()


def load_identity() -> None:
    """before_request: resolve the cookie to a live user record.

    Re-reading the row every request is what makes an admin's group move, a role
    change or a disable take effect on the user's *next request* rather than
    their next login. It is one indexed lookup against local WAL SQLite.
    """
    g.user = None
    g.gid = None
    uid = session.get("uid")
    if uid is None:
        return
    user = load_user_row(uid)
    if user is None or user["disabled"] or user["pw_version"] != session.get("pwv"):
        session.clear()
        return
    g.user = user
    g.gid = user["group_id"]


def gid() -> int:
    """The active group. Raises rather than returning None, so a route that
    somehow runs without a session fails loudly instead of querying group 0."""
    if getattr(g, "gid", None) is None:
        raise RuntimeError("gid() called without an authenticated session")
    return g.gid


def current_user() -> dict | None:
    return getattr(g, "user", None)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({"ok": False, "error": "Authentication required"}), 401
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"ok": False, "error": "Authentication required"}), 401
        if user["role"] != "admin":
            return jsonify({"ok": False, "error": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


# ── serialisation ────────────────────────────────────────────────────────────

def group_row(gid_: int) -> dict:
    row = db().execute("SELECT * FROM groups WHERE id = ?", (gid_,)).fetchone()
    return dict(row)


def public_user(user: dict) -> dict:
    grp = group_row(user["group_id"])
    return {
        "id": user["public_id"],
        "username": user["username"],
        "role": user["role"],
        "group": public_group(grp),
    }


def public_group(grp: dict) -> dict:
    return {"id": grp["public_id"], "name": grp["name"], "kind": grp["kind"]}
