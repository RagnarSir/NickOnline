"""NickOnline API — accounts and group-scoped libraries.

The calculator is public and entirely client-side; this server exists only so a
group of people can share a library of saved matchups and lineups, and so that
no group can see another's. Isolation lives in library.py; the guards live in
auth.py; everything here is routing.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import timedelta

from flask import Flask, g, jsonify, request

import auth
import library
import validate
from db import close_db, db, load_or_create_secret, new_public_id
from ratelimit import hit, reset

# The public prefix. It must agree with vite.config.ts `base`, the systemd unit's
# NICKONLINE_BASE_PATH, and the nginx location — the cookie path is derived from
# it, so a mismatch logs everyone out silently.
BASE_PATH = os.environ.get("NICKONLINE_BASE_PATH", "/NickOnline").rstrip("/")
API = f"{BASE_PATH}/api"

# A cross-site HTML form cannot set a custom header, so requiring one on every
# mutating call is a free CSRF defence on top of SameSite=Lax.
CSRF_HEADER = "X-NickOnline"


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = load_or_create_secret()
    app.config.update(
        # The VPS vhost is shared with other apps, so the cookie must be
        # namespaced by both name and path or it collides with theirs.
        SESSION_COOKIE_NAME="nickonline_session",
        SESSION_COOKIE_PATH=f"{BASE_PATH}/",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # Env-conditional: hardcoding True (as RagCheat does) silently drops the
        # cookie over http://localhost:5173, so dev logins appear to succeed and
        # then instantly do not.
        SESSION_COOKIE_SECURE=os.environ.get("NICKONLINE_COOKIE_SECURE", "1") != "0",
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
        SESSION_REFRESH_EACH_REQUEST=True,
        MAX_CONTENT_LENGTH=256 * 1024,
        JSON_SORT_KEYS=False,
    )

    app.teardown_appcontext(close_db)
    app.before_request(auth.load_identity)
    app.before_request(_require_csrf_header)
    app.after_request(_no_store)

    _register(app)
    return app


def _require_csrf_header():
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if request.headers.get(CSRF_HEADER) != "1":
        return jsonify({"ok": False, "error": "Missing request header"}), 400
    return None


def _no_store(resp):
    # Set in the app rather than in nginx so dev behaves like production.
    resp.headers["Cache-Control"] = "no-store"
    return resp


def body() -> dict:
    return request.get_json(silent=True) or {}


def _register(app: Flask) -> None:  # noqa: C901 — a flat route table reads better whole

    # ── health ───────────────────────────────────────────────────────────────

    @app.get(f"{API}/health")
    def health():
        return jsonify({"ok": True})

    # ── auth ─────────────────────────────────────────────────────────────────

    @app.get(f"{API}/auth/me")
    def me():
        user = auth.current_user()
        return jsonify({"user": auth.public_user(user) if user else None})

    @app.post(f"{API}/auth/signup")
    def signup():
        ok, retry = hit("signup:ip", auth.client_ip())
        if not ok:
            return jsonify({"ok": False, "error": "Too many sign-ups from here. Try later."}), 429
        b = body()
        user, err = auth.create_user(b.get("username", ""), b.get("password", ""))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        auth.start_session(user)
        auth.record_event("signup", user["username"], user["id"])
        return jsonify({"user": auth.public_user(user)})

    @app.post(f"{API}/auth/login")
    def login():
        b = body()
        name = auth.norm(b.get("username", ""))
        ip_ok, ip_retry = hit("login:ip", auth.client_ip())
        user_ok, user_retry = hit("login:user", name or "-")
        if not (ip_ok and user_ok):
            auth.record_event("lockout", name)
            resp = jsonify({"ok": False, "error": "Too many attempts. Try again later."})
            resp.headers["Retry-After"] = str(max(ip_retry, user_retry))
            return resp, 429

        user = auth.verify(name, b.get("password", ""))
        if user is None:
            auth.record_event("failed", name)
            return jsonify({"ok": False, "error": "Invalid username or password"}), 401
        if user["disabled"]:
            auth.record_event("failed", name, user["id"])
            return jsonify({"ok": False, "error": "That account is disabled"}), 403

        reset("login:user", name)
        auth.start_session(user)
        auth.record_event("success", user["username"], user["id"])
        return jsonify({"user": auth.public_user(user)})

    @app.post(f"{API}/auth/logout")
    def logout():
        auth.end_session()
        return jsonify({"ok": True})

    @app.post(f"{API}/auth/password")
    @auth.login_required
    def change_password():
        b = body()
        user = auth.current_user()
        # Requires the current password so a hijacked open session cannot
        # silently lock the owner out.
        if auth.verify(user["username"], b.get("current", "")) is None:
            return jsonify({"ok": False, "error": "Current password is incorrect"}), 400
        err = auth.set_password(user["id"], b.get("next", ""))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        auth.start_session(auth.load_user_row(user["id"]))  # keep *this* session alive
        return jsonify({"ok": True})

    # ── groups ───────────────────────────────────────────────────────────────

    @app.post(f"{API}/groups/join")
    @auth.login_required
    def join_group():
        code = (body().get("code") or "").strip().upper()
        user = auth.current_user()
        row = db().execute(
            "SELECT * FROM groups WHERE join_code = ? AND kind = 'shared'", (code,)
        ).fetchone()
        if row is None or (row["join_max"] is not None and row["join_uses"] >= row["join_max"]):
            return jsonify({"ok": False, "error": "That join code is not valid"}), 404
        if row["id"] == user["group_id"]:
            return jsonify({"ok": False, "error": "You are already in that group"}), 400
        db().execute("UPDATE users SET group_id = ? WHERE id = ?", (row["id"], user["id"]))
        db().execute("UPDATE groups SET join_uses = join_uses + 1 WHERE id = ?", (row["id"],))
        db().commit()
        auth.record_event("join", user["username"], user["id"])
        return jsonify({"user": auth.public_user(auth.load_user_row(user["id"]))})

    @app.post(f"{API}/groups/leave")
    @auth.login_required
    def leave_group():
        """Back to the personal group. Rows never move, so the personal shelf is
        exactly as it was left."""
        user = auth.current_user()
        db().execute(
            "UPDATE users SET group_id = personal_group_id WHERE id = ?", (user["id"],)
        )
        db().commit()
        return jsonify({"user": auth.public_user(auth.load_user_row(user["id"]))})

    # ── library ──────────────────────────────────────────────────────────────

    @app.get(f"{API}/library")
    @auth.login_required
    def get_library():
        # One bootstrap round-trip. The Scenario table simulates every matchup
        # and the matrix simulates every pairing, so the client genuinely needs
        # the full payloads rather than a summary.
        return jsonify({
            "matchups": library.list_matchups(auth.gid()),
            "lineups": library.list_lineups(auth.gid()),
        })

    def _write_allowed():
        ok, retry = hit("write:user", str(auth.current_user()["id"]))
        return ok

    @app.put(f"{API}/matchups")
    @auth.login_required
    def put_matchup():
        if not _write_allowed():
            return jsonify({"ok": False, "error": "Slow down"}), 429
        b = body()
        name, err = validate.clean_name(b.get("name"))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        payload = {"input": b.get("input"), "corrections": b.get("corrections")}
        err = validate.check_match_payload(payload)
        if err:
            return jsonify({"ok": False, "error": err}), 400
        row, conflict = library.upsert_matchup(
            auth.gid(), auth.current_user()["id"], name, payload,
            bool(b.get("overwrite")), auth.now_ms(),
        )
        if conflict:
            return jsonify({"ok": False, "error": "conflict", "existing": conflict}), 409
        return jsonify(row)

    @app.delete(f"{API}/matchups/<public_id>")
    @auth.login_required
    def del_matchup(public_id):
        if not library.delete_matchup(auth.gid(), public_id):
            return jsonify({"ok": False, "error": "Not found"}), 404
        return jsonify({"ok": True})

    @app.post(f"{API}/lineups")
    @auth.login_required
    def post_lineup():
        if not _write_allowed():
            return jsonify({"ok": False, "error": "Slow down"}), 429
        b = body()
        name, err = validate.clean_name(b.get("name"))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        side = b.get("side")
        if side not in ("A", "B"):
            return jsonify({"ok": False, "error": "side must be A or B"}), 400
        err = validate.check_team(b.get("team"))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        row, conflict = library.upsert_lineup(
            auth.gid(), auth.current_user()["id"], side, name, b["team"],
            bool(b.get("overwrite")), auth.now_ms(),
        )
        if conflict:
            return jsonify({"ok": False, "error": "conflict", "existing": conflict}), 409
        return jsonify(row)

    @app.delete(f"{API}/lineups/<public_id>")
    @auth.login_required
    def del_lineup(public_id):
        if not library.delete_lineup(auth.gid(), public_id):
            return jsonify({"ok": False, "error": "Not found"}), 404
        return jsonify({"ok": True})

    # ── migrations: personal -> shared, and localStorage -> group ────────────

    @app.get(f"{API}/personal/pending")
    @auth.login_required
    def personal_pending():
        user = auth.current_user()
        if user["group_id"] == user["personal_group_id"]:
            return jsonify({"matchups": 0, "lineups": 0})
        return jsonify(library.counts(user["personal_group_id"]))

    @app.post(f"{API}/personal/import")
    @auth.login_required
    def personal_import():
        user = auth.current_user()
        if user["group_id"] == user["personal_group_id"]:
            return jsonify({"added": 0, "skipped": []})
        result = library.copy_between_groups(
            user["personal_group_id"], user["group_id"], user["id"]
        )
        return jsonify(result)

    @app.post(f"{API}/import/local")
    @auth.login_required
    def import_local():
        """One-time import of what a browser had in localStorage. Explicit, and
        skip-on-conflict, so a second call is a reported no-op rather than a
        merge that clobbers a colleague's identically named matchup."""
        b = body()
        user = auth.current_user()
        gid = auth.gid()
        added, skipped = 0, []

        for item in (b.get("matchups") or [])[:200]:
            name, err = validate.clean_name(item.get("name"))
            if err:
                continue
            payload = {"input": item.get("input"), "corrections": item.get("corrections")}
            if validate.check_match_payload(payload):
                skipped.append(f"{name} (unreadable)")
                continue
            row, conflict = library.upsert_matchup(
                gid, user["id"], name, payload, False,
                int(item.get("savedAt") or auth.now_ms()),
            )
            if conflict:
                skipped.append(name)
            else:
                added += 1

        for item in (b.get("lineups") or [])[:200]:
            name, err = validate.clean_name(item.get("name"))
            if err or item.get("side") not in ("A", "B"):
                continue
            if validate.check_team(item.get("team")):
                skipped.append(f"{name} (unreadable)")
                continue
            row, conflict = library.upsert_lineup(
                gid, user["id"], item["side"], name, item["team"], False,
                int(item.get("savedAt") or auth.now_ms()),
            )
            if conflict:
                skipped.append(f"{item['side']}: {name}")
            else:
                added += 1

        db().execute(
            "UPDATE users SET local_import_at = ? WHERE id = ?", (auth.now_ms(), user["id"])
        )
        db().commit()
        return jsonify({"added": added, "skipped": skipped})

    # ── admin ────────────────────────────────────────────────────────────────

    @app.get(f"{API}/admin/users")
    @auth.admin_required
    def admin_users():
        users = db().execute(
            "SELECT u.*, g.name AS group_name, g.public_id AS group_public_id"
            "  FROM users u JOIN groups g ON g.id = u.group_id ORDER BY u.created_at"
        ).fetchall()
        groups = db().execute(
            "SELECT * FROM groups WHERE kind = 'shared' ORDER BY name"
        ).fetchall()
        return jsonify({
            "users": [{
                "id": u["public_id"], "username": u["username"], "role": u["role"],
                "disabled": bool(u["disabled"]), "createdAt": u["created_at"],
                "group": {"id": u["group_public_id"], "name": u["group_name"]},
            } for u in users],
            "groups": [{
                "id": g_["public_id"], "name": g_["name"], "joinCode": g_["join_code"],
                "joinUses": g_["join_uses"], "joinMax": g_["join_max"],
            } for g_ in groups],
        })

    @app.post(f"{API}/admin/groups")
    @auth.admin_required
    def admin_create_group():
        name, err = validate.clean_name(body().get("name"))
        if err:
            return jsonify({"ok": False, "error": err}), 400
        code = _new_join_code()
        try:
            db().execute(
                "INSERT INTO groups (public_id, name, kind, join_code, created_at)"
                " VALUES (?, ?, 'shared', ?, ?)",
                (new_public_id(), name, code, auth.now_ms()),
            )
            db().commit()
        except sqlite3.IntegrityError:
            return jsonify({"ok": False, "error": "A group with that name exists"}), 400
        row = db().execute("SELECT * FROM groups WHERE join_code = ?", (code,)).fetchone()
        return jsonify({"id": row["public_id"], "name": row["name"], "joinCode": code})

    @app.post(f"{API}/admin/groups/<public_id>/code")
    @auth.admin_required
    def admin_rotate_code(public_id):
        """Regenerate, or revoke with {"revoke": true}. A leaked code is the one
        way into a group, so revoking has to be one click."""
        b = body()
        code = None if b.get("revoke") else _new_join_code()
        cur = db().execute(
            "UPDATE groups SET join_code = ?, join_uses = 0, join_max = ?"
            " WHERE public_id = ? AND kind = 'shared'",
            (code, b.get("maxUses"), public_id),
        )
        db().commit()
        if cur.rowcount == 0:
            return jsonify({"ok": False, "error": "Not found"}), 404
        return jsonify({"joinCode": code})

    @app.post(f"{API}/admin/users/<public_id>/role")
    @auth.admin_required
    def admin_set_role(public_id):
        role = body().get("role")
        if role not in ("user", "admin"):
            return jsonify({"ok": False, "error": "Invalid role"}), 400
        target = _user_by_public_id(public_id)
        if target is None:
            return jsonify({"ok": False, "error": "Not found"}), 404
        if role != "admin" and _would_orphan_admins(target):
            return jsonify({"ok": False, "error": "That is the last admin"}), 400
        db().execute("UPDATE users SET role = ? WHERE id = ?", (role, target["id"]))
        db().commit()
        return jsonify({"ok": True})

    @app.post(f"{API}/admin/users/<public_id>/disabled")
    @auth.admin_required
    def admin_set_disabled(public_id):
        disabled = 1 if body().get("disabled") else 0
        target = _user_by_public_id(public_id)
        if target is None:
            return jsonify({"ok": False, "error": "Not found"}), 404
        if disabled and _would_orphan_admins(target):
            return jsonify({"ok": False, "error": "That is the last admin"}), 400
        db().execute("UPDATE users SET disabled = ? WHERE id = ?", (disabled, target["id"]))
        db().commit()
        return jsonify({"ok": True})

    @app.get(f"{API}/admin/login-log")
    @auth.admin_required
    def admin_login_log():
        limit = min(int(request.args.get("limit", 200)), 1000)
        rows = db().execute(
            "SELECT ts, username, event, ip, user_agent FROM login_events"
            " ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])


def _new_join_code() -> str:
    """Readable over the phone: no vowels (so no accidental words), no 0/O/1/I."""
    import secrets
    alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def _user_by_public_id(public_id: str):
    return db().execute("SELECT * FROM users WHERE public_id = ?", (public_id,)).fetchone()


def _would_orphan_admins(target) -> bool:
    if target["role"] != "admin":
        return False
    n = db().execute(
        "SELECT COUNT(*) c FROM users WHERE role = 'admin' AND disabled = 0"
    ).fetchone()["c"]
    return n <= 1


app = create_app()
