import copy
import json
import os
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

REPO = SERVER.parent


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("NICKONLINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("NICKONLINE_COOKIE_SECURE", "0")
    monkeypatch.setenv("NICKONLINE_BASE_PATH", "/NickOnline")
    for mod in ("app", "auth", "db", "library", "ratelimit", "validate"):
        sys.modules.pop(mod, None)
    import app as app_module
    from db import init_db

    application = app_module.create_app()
    with application.app_context():
        init_db()
    application.config["TESTING"] = True
    return application


API = "/NickOnline/api"


class Client:
    """Thin wrapper that supplies the CSRF header on every mutating call."""

    def __init__(self, flask_client):
        self.c = flask_client

    def get(self, path, **kw):
        return self.c.get(API + path, **kw)

    def post(self, path, json_body=None, **kw):
        return self.c.post(API + path, json=json_body or {},
                           headers={"X-NickOnline": "1"}, **kw)

    def put(self, path, json_body=None, **kw):
        return self.c.put(API + path, json=json_body or {},
                          headers={"X-NickOnline": "1"}, **kw)

    def delete(self, path, **kw):
        return self.c.delete(API + path, headers={"X-NickOnline": "1"}, **kw)


def make_user(app, username, password="hunter2hunter"):
    c = Client(app.test_client())
    r = c.post("/auth/signup", {"username": username, "password": password})
    assert r.status_code == 200, r.get_json()
    return c


@pytest.fixture()
def anon(app):
    return Client(app.test_client())


@pytest.fixture()
def alice(app):
    return make_user(app, "alice")


@pytest.fixture()
def bob(app):
    return make_user(app, "bob")


@pytest.fixture()
def admin(app):
    c = make_user(app, "root")
    with app.app_context():
        from db import db
        db().execute("UPDATE users SET role = 'admin' WHERE username = 'root'")
        db().commit()
    return c


# A real MatchInput straight from the workbook export, so a type change in the
# engine that the validator would reject fails these tests rather than production.
EXAMPLE = json.loads((REPO / "src" / "data" / "example.json").read_text())


def match_body(name="Cup final"):
    # Deep copy: tests mutate these to probe the validator, and EXAMPLE is
    # module-level, so sharing it would leak one test's edits into the next.
    return {"name": name, "input": copy.deepcopy(EXAMPLE), "corrections": {}}


def team_body(name="4-4-2", side="A"):
    return {"name": name, "side": side, "team": copy.deepcopy(EXAMPLE["teamA"])}
