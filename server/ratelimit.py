"""SQLite-backed throttling.

In-process counters would be wrong here: gunicorn runs two workers, so a
per-process count of 5 is really 10, and a restart resets it. The whole
check-and-increment is therefore a single UPSERT ... RETURNING, which runs
inside SQLite's write lock and is correct across workers and processes.

Buckets are keyed on BOTH the username and the IP, because either alone is
trivially bypassed: per-IP only lets a botnet spray one account, per-username
only lets one host walk the whole user list.
"""

from __future__ import annotations

import time

from db import db

# (limit, window in milliseconds)
LIMITS = {
    "login:ip": (20, 15 * 60_000),
    "login:user": (8, 15 * 60_000),
    "signup:ip": (3, 60 * 60_000),
    "write:user": (120, 60_000),
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def hit(kind: str, key: str) -> tuple[bool, int]:
    """Atomic check-and-increment. Returns (allowed, retry_after_seconds)."""
    limit, window = LIMITS[kind]
    bucket = f"{kind}:{key}"
    now = _now_ms()
    row = db().execute(
        """
        INSERT INTO rate_limit (bucket, window_start, count) VALUES (?, ?, 1)
        ON CONFLICT(bucket) DO UPDATE SET
          window_start = CASE WHEN ? - rate_limit.window_start >= ?
                              THEN ? ELSE rate_limit.window_start END,
          count        = CASE WHEN ? - rate_limit.window_start >= ?
                              THEN 1 ELSE rate_limit.count + 1 END
        RETURNING count, window_start
        """,
        (bucket, now, now, window, now, now, window),
    ).fetchone()
    db().commit()
    allowed = row["count"] <= limit
    retry_after = max(0, (row["window_start"] + window - now + 999) // 1000)
    return allowed, retry_after


def reset(kind: str, key: str) -> None:
    """Clear a bucket after a success, so one fat-fingered password does not
    count against the user for the next quarter of an hour."""
    db().execute("DELETE FROM rate_limit WHERE bucket = ?", (f"{kind}:{key}",))
    db().commit()
