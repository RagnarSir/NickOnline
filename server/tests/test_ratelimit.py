"""Rate limiting is SQLite-backed rather than in-process because gunicorn runs
two workers: a per-process counter of 5 would really be 10."""

import time

import pytest

from conftest import Client


def test_repeated_bad_passwords_lock_the_account_out(app, alice):
    c = Client(app.test_client())
    for _ in range(8):
        assert c.post("/auth/login", {"username": "alice", "password": "nope-nope"}).status_code == 401
    r = c.post("/auth/login", {"username": "alice", "password": "nope-nope"})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_lockout_follows_the_username_across_addresses(app, alice):
    """Per-IP alone would let a botnet spray one account."""
    for i in range(8):
        c = Client(app.test_client())
        c.post("/auth/login", {"username": "alice", "password": "nope-nope"},
               environ_base={"REMOTE_ADDR": f"10.0.0.{i}"})
    c = Client(app.test_client())
    r = c.post("/auth/login", {"username": "alice", "password": "hunter2hunter"},
               environ_base={"REMOTE_ADDR": "10.0.0.99"})
    assert r.status_code == 429, "a fresh address must not reset a username lockout"


def test_a_successful_login_clears_the_users_bucket(app, alice):
    c = Client(app.test_client())
    for _ in range(4):
        c.post("/auth/login", {"username": "alice", "password": "nope-nope"})
    assert c.post("/auth/login", {"username": "alice", "password": "hunter2hunter"}).status_code == 200
    for _ in range(7):
        c.post("/auth/login", {"username": "alice", "password": "nope-nope"})
    assert c.post("/auth/login",
                  {"username": "alice", "password": "hunter2hunter"}).status_code == 200


def test_signups_from_one_address_are_capped(app, anon):
    for i in range(3):
        assert anon.post("/auth/signup",
                         {"username": f"u{i}", "password": "hunter2hunter"}).status_code == 200
    r = anon.post("/auth/signup", {"username": "u4", "password": "hunter2hunter"})
    assert r.status_code == 429


def test_the_window_expires(app, alice, monkeypatch):
    import ratelimit
    c = Client(app.test_client())
    for _ in range(9):
        c.post("/auth/login", {"username": "alice", "password": "nope-nope"})
    assert c.post("/auth/login", {"username": "alice", "password": "nope-nope"}).status_code == 429

    later = ratelimit._now_ms() + 16 * 60_000
    monkeypatch.setattr(ratelimit, "_now_ms", lambda: later)
    assert c.post("/auth/login",
                  {"username": "alice", "password": "hunter2hunter"}).status_code == 200


def test_the_counter_is_shared_across_connections(app):
    """Two independent connections, as two gunicorn workers would be."""
    import ratelimit
    from db import connect

    with app.app_context():
        for i in range(5):
            allowed, _ = ratelimit.hit("login:user", "shared")
        assert allowed

    # A second app context = a second connection, exactly like another worker.
    with app.app_context():
        for i in range(4):
            allowed, _ = ratelimit.hit("login:user", "shared")
        assert not allowed, "the 9th hit must be blocked no matter which worker saw it"


def test_the_trusted_client_ip_is_the_rightmost_forwarded_entry(app):
    """nginx appends the real peer, so a client-supplied XFF is prepended and
    must never be believed."""
    import auth
    with app.test_request_context(
        "/", headers={"X-Forwarded-For": "1.2.3.4, 203.0.113.9"}
    ):
        assert auth.client_ip() == "203.0.113.9"
