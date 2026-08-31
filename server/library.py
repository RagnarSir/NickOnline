"""The ONLY module that reads or writes matchups and lineups.

Every function takes `gid` as its first positional parameter and puts it in the
WHERE clause. Route handlers pass `auth.gid()`, which comes from the session.
No function here accepts a group from a caller-supplied dict, and no route
handler anywhere parses a group out of `request` — that invariant is what
`tests/test_isolation.py` and `tests/test_source_guard.py` exist to protect.

A lookup that matches no row in *your* group returns None, and the route turns
that into 404 rather than 403. A 403 would confirm the row exists, which is an
existence oracle over other groups' matchup names.
"""

from __future__ import annotations

import json

from db import db, new_public_id


def _matchup(row) -> dict:
    return {
        "id": row["public_id"],
        "name": row["name"],
        "savedAt": row["saved_at"],
        "savedBy": row["saved_by"] or "(deleted user)",
        **json.loads(row["payload"]),  # input, corrections
    }


def _lineup(row) -> dict:
    return {
        "id": row["public_id"],
        "name": row["name"],
        "side": row["side"],
        "savedAt": row["saved_at"],
        "savedBy": row["saved_by"] or "(deleted user)",
        "team": json.loads(row["team"]),
    }


_MATCHUP_SELECT = """
    SELECT m.*, u.username AS saved_by
      FROM matchups m LEFT JOIN users u ON u.id = m.updated_by
     WHERE m.group_id = ?
"""

_LINEUP_SELECT = """
    SELECT l.*, u.username AS saved_by
      FROM lineups l LEFT JOIN users u ON u.id = l.updated_by
     WHERE l.group_id = ?
"""


def list_matchups(gid: int) -> list[dict]:
    rows = db().execute(_MATCHUP_SELECT + " ORDER BY m.saved_at DESC", (gid,)).fetchall()
    return [_matchup(r) for r in rows]


def list_lineups(gid: int) -> list[dict]:
    rows = db().execute(_LINEUP_SELECT + " ORDER BY l.saved_at DESC", (gid,)).fetchall()
    return [_lineup(r) for r in rows]


def get_matchup_by_name(gid: int, name: str) -> dict | None:
    row = db().execute(
        _MATCHUP_SELECT + " AND m.name = ? COLLATE NOCASE", (gid, name)
    ).fetchone()
    return _matchup(row) if row else None


def upsert_matchup(gid: int, uid: int, name: str, payload: dict, overwrite: bool,
                   saved_at: int) -> tuple[dict | None, dict | None]:
    """Returns (row, conflict). A same-named matchup on a shared shelf may be a
    colleague's work, so replacing it takes an explicit `overwrite`."""
    conn = db()
    existing = conn.execute(
        "SELECT m.*, u.username AS saved_by FROM matchups m"
        " LEFT JOIN users u ON u.id = m.updated_by"
        " WHERE m.group_id = ? AND m.name = ? COLLATE NOCASE",
        (gid, name),
    ).fetchone()

    if existing and not overwrite:
        return None, {"name": existing["name"], "savedBy": existing["saved_by"],
                      "savedAt": existing["saved_at"]}

    blob = json.dumps(payload, separators=(",", ":"))
    if existing:
        conn.execute(
            "UPDATE matchups SET name = ?, saved_at = ?, updated_by = ?, payload = ?"
            " WHERE id = ? AND group_id = ?",
            (name, saved_at, uid, blob, existing["id"], gid),
        )
        pid = existing["public_id"]
    else:
        pid = new_public_id()
        conn.execute(
            "INSERT INTO matchups (public_id, group_id, name, saved_at, created_by,"
            " updated_by, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pid, gid, name, saved_at, uid, uid, blob),
        )
    conn.commit()
    row = conn.execute(_MATCHUP_SELECT + " AND m.public_id = ?", (gid, pid)).fetchone()
    return _matchup(row), None


def delete_matchup(gid: int, public_id: str) -> bool:
    cur = db().execute(
        "DELETE FROM matchups WHERE public_id = ? AND group_id = ?", (public_id, gid)
    )
    db().commit()
    return cur.rowcount > 0


def upsert_lineup(gid: int, uid: int, side: str, name: str, team: dict, overwrite: bool,
                  saved_at: int) -> tuple[dict | None, dict | None]:
    conn = db()
    existing = conn.execute(
        "SELECT l.*, u.username AS saved_by FROM lineups l"
        " LEFT JOIN users u ON u.id = l.updated_by"
        " WHERE l.group_id = ? AND l.side = ? AND l.name = ? COLLATE NOCASE",
        (gid, side, name),
    ).fetchone()

    if existing and not overwrite:
        return None, {"name": existing["name"], "savedBy": existing["saved_by"],
                      "savedAt": existing["saved_at"]}

    blob = json.dumps(team, separators=(",", ":"))
    if existing:
        conn.execute(
            "UPDATE lineups SET name = ?, saved_at = ?, updated_by = ?, team = ?"
            " WHERE id = ? AND group_id = ?",
            (name, saved_at, uid, blob, existing["id"], gid),
        )
        pid = existing["public_id"]
    else:
        pid = new_public_id()
        conn.execute(
            "INSERT INTO lineups (public_id, group_id, side, name, saved_at, created_by,"
            " updated_by, team) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, gid, side, name, saved_at, uid, uid, blob),
        )
    conn.commit()
    row = conn.execute(_LINEUP_SELECT + " AND l.public_id = ?", (gid, pid)).fetchone()
    return _lineup(row), None


def delete_lineup(gid: int, public_id: str) -> bool:
    cur = db().execute(
        "DELETE FROM lineups WHERE public_id = ? AND group_id = ?", (public_id, gid)
    )
    db().commit()
    return cur.rowcount > 0


def counts(gid: int) -> dict:
    m = db().execute("SELECT COUNT(*) c FROM matchups WHERE group_id = ?", (gid,)).fetchone()["c"]
    l = db().execute("SELECT COUNT(*) c FROM lineups WHERE group_id = ?", (gid,)).fetchone()["c"]
    return {"matchups": m, "lineups": l}


def copy_between_groups(src_gid: int, dst_gid: int, uid: int) -> dict:
    """Copy, never move: the originals stay in the source group, so joining a
    shared group and later leaving it is not a dead end.

    Name conflicts are skipped and reported rather than overwritten — the
    destination's rows may be colleagues' work.
    """
    added, skipped = 0, []
    for row in db().execute("SELECT * FROM matchups WHERE group_id = ?", (src_gid,)).fetchall():
        rec, conflict = upsert_matchup(
            dst_gid, uid, row["name"], json.loads(row["payload"]), False, row["saved_at"]
        )
        if conflict:
            skipped.append(row["name"])
        else:
            added += 1
    for row in db().execute("SELECT * FROM lineups WHERE group_id = ?", (src_gid,)).fetchall():
        rec, conflict = upsert_lineup(
            dst_gid, uid, row["side"], row["name"], json.loads(row["team"]), False, row["saved_at"]
        )
        if conflict:
            skipped.append(f"{row['side']}: {row['name']}")
        else:
            added += 1
    return {"added": added, "skipped": skipped}
