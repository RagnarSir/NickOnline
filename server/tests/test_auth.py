from conftest import Client, make_user, match_body


def test_signup_creates_a_personal_group(alice):
    me = alice.get("/auth/me").get_json()["user"]
    assert me["username"] == "alice"
    assert me["group"] == {"id": me["group"]["id"], "name": "alice", "kind": "personal"}
    assert me["role"] == "user"


def test_anonymous_me_is_not_an_error(anon):
    r = anon.get("/auth/me")
    assert r.status_code == 200 and r.get_json() == {"user": None}


def test_usernames_are_case_insensitive_and_unique(app, anon):
    make_user(app, "Ragnar")
    r = anon.post("/auth/signup", {"username": "ragnar", "password": "hunter2hunter"})
    assert r.status_code == 400 and "taken" in r.get_json()["error"]


def test_short_passwords_and_odd_usernames_are_refused(anon):
    assert anon.post("/auth/signup", {"username": "x", "password": "short"}).status_code == 400
    assert anon.post("/auth/signup",
                     {"username": "a b", "password": "hunter2hunter"}).status_code == 400


def test_login_and_logout_round_trip(app, alice):
    fresh = Client(app.test_client())
    assert fresh.get("/library").status_code == 401
    assert fresh.post("/auth/login",
                      {"username": "alice", "password": "hunter2hunter"}).status_code == 200
    assert fresh.get("/library").status_code == 200
    fresh.post("/auth/logout")
    assert fresh.get("/library").status_code == 401


def test_wrong_password_is_401_and_does_not_say_which_half_was_wrong(alice, app):
    fresh = Client(app.test_client())
    r = fresh.post("/auth/login", {"username": "alice", "password": "wrongwrongwrong"})
    assert r.status_code == 401
    assert r.get_json()["error"] == "Invalid username or password"
    r = fresh.post("/auth/login", {"username": "nobody", "password": "wrongwrongwrong"})
    assert r.get_json()["error"] == "Invalid username or password"


def test_cookie_is_namespaced_for_the_shared_vhost(app, anon):
    """The VPS vhost serves other apps too, so name and path must be ours."""
    r = anon.post("/auth/signup", {"username": "alice", "password": "hunter2hunter"})
    cookie = r.headers["Set-Cookie"]
    assert cookie.startswith("nickonline_session=")
    assert "Path=/NickOnline/" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert "Secure" not in cookie, "NICKONLINE_COOKIE_SECURE=0 in tests"


def test_secure_flag_follows_the_environment(tmp_path, monkeypatch):
    import sys
    monkeypatch.setenv("NICKONLINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("NICKONLINE_COOKIE_SECURE", "1")
    for mod in ("app", "auth", "db", "library", "ratelimit", "validate"):
        sys.modules.pop(mod, None)
    import app as app_module
    from db import init_db

    application = app_module.create_app()
    with application.app_context():
        init_db()
    c = Client(application.test_client())
    r = c.post("/auth/signup", {"username": "alice", "password": "hunter2hunter"})
    assert "Secure" in r.headers["Set-Cookie"]


def test_password_change_kills_sessions_elsewhere(app, alice):
    other = Client(app.test_client())
    other.post("/auth/login", {"username": "alice", "password": "hunter2hunter"})
    assert other.get("/library").status_code == 200

    r = alice.post("/auth/password", {"current": "hunter2hunter", "next": "correcthorse"})
    assert r.status_code == 200

    assert other.get("/library").status_code == 401, "the other device must be logged out"
    assert alice.get("/library").status_code == 200, "but the session that changed it survives"


def test_password_change_requires_the_current_password(alice):
    r = alice.post("/auth/password", {"current": "nope", "next": "correcthorse"})
    assert r.status_code == 400


def test_disabling_a_user_takes_effect_mid_session(app, alice, admin):
    users = admin.get("/admin/users").get_json()["users"]
    target = next(u for u in users if u["username"] == "alice")
    assert admin.post(f"/admin/users/{target['id']}/disabled", {"disabled": True}).status_code == 200
    assert alice.get("/library").status_code == 401


def test_mutating_calls_need_the_csrf_header(app, alice):
    """A cross-site form cannot set a custom header; SameSite=Lax is the belt,
    this is the braces."""
    r = alice.c.put("/NickOnline/api/matchups", json=match_body())
    assert r.status_code == 400
    assert alice.c.get("/NickOnline/api/library").status_code == 200, "reads are unaffected"
