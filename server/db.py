"""SQLite access: one connection per request, WAL, foreign keys on.

The database and the session secret live in NICKONLINE_DATA_DIR, which is a
*sibling* of the two rsync targets on the VPS (dist/ and server/). That is what
makes `rsync --delete` structurally incapable of wiping them — stronger than a
--filter 'protect' rule, which is one careless edit away from being dropped.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from pathlib import Path

from flask import g

# `INSERT ... ON CONFLICT ... RETURNING` in ratelimit.py needs 3.35. Ubuntu
# 22.04 ships 3.37 and 24.04 ships 3.45, so this only fires on something exotic.
if sqlite3.sqlite_version_info < (3, 35):
    raise RuntimeError(
        f"SQLite {sqlite3.sqlite_version} is too old; NickOnline needs 3.35+ "
        "for UPSERT ... RETURNING (see server/ratelimit.py)."
    )

SCHEMA = Path(__file__).resolve().parent / "schema.sql"


def data_dir() -> Path:
    d = Path(os.environ.get("NICKONLINE_DATA_DIR", Path(__file__).resolve().parent / ".devdata"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def db_path() -> Path:
    return data_dir() / "nickonline.sqlite3"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def db() -> sqlite3.Connection:
    """The connection for this request, opened lazily and closed by teardown."""
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    """Create the schema. Run once at deploy time, before the service starts, so
    two gunicorn workers never race each other on CREATE TABLE."""
    conn = connect()
    try:
        conn.executescript(SCHEMA.read_text())
        conn.commit()
    finally:
        conn.close()


def load_or_create_secret() -> bytes:
    """Read a stable session secret from the data dir, or create and persist one.
    Stable means sessions survive a redeploy. Lifted from RagCheat."""
    path = data_dir() / "secret_key"
    try:
        data = path.read_bytes()
        if data:
            return data
    except FileNotFoundError:
        pass
    secret = secrets.token_bytes(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(secret)
    return secret


def new_public_id() -> str:
    """Opaque row identifier. Rowids never leave the server, so an id from one
    group tells you nothing about another's and cannot be enumerated."""
    return secrets.token_hex(8)
