"""The property this whole feature exists to guarantee: no group can see, touch,
or learn of another group's saved work.

The last test in this file walks Flask's url_map and fails if any data route is
missing from the table below — so adding an endpoint and forgetting to test its
scoping breaks the suite, and therefore breaks `python3 deploy.py`.
"""

import pytest

from conftest import Client, match_body, team_body

# (method, path template) for every route that reads or writes group-owned data.
DATA_ENDPOINTS = [
    ("GET", "/NickOnline/api/library"),
    ("PUT", "/NickOnline/api/matchups"),
    ("DELETE", "/NickOnline/api/matchups/<public_id>"),
    ("POST", "/NickOnline/api/lineups"),
    ("DELETE", "/NickOnline/api/lineups/<public_id>"),
    ("GET", "/NickOnline/api/personal/pending"),
    ("POST", "/NickOnline/api/personal/import"),
    ("POST", "/NickOnline/api/import/local"),
    ("POST", "/NickOnline/api/groups/join"),
    ("POST", "/NickOnline/api/groups/leave"),
]

PUBLIC_ROUTES = {
    "/NickOnline/api/health",
    "/NickOnline/api/auth/me",
    "/NickOnline/api/auth/signup",
    "/NickOnline/api/auth/login",
    "/NickOnline/api/auth/logout",
    "/NickOnline/api/auth/password",
    "/static/<path:filename>",
}


def test_anonymous_is_locked_out_of_every_data_route(anon):
    assert anon.get("/library").status_code == 401
    assert anon.put("/matchups", match_body()).status_code == 401
    assert anon.delete("/matchups/whatever").status_code == 401
    assert anon.post("/lineups", team_body()).status_code == 401
    assert anon.delete("/lineups/whatever").status_code == 401
    assert anon.get("/personal/pending").status_code == 401
    assert anon.post("/personal/import").status_code == 401
    assert anon.post("/import/local").status_code == 401
    assert anon.post("/groups/join", {"code": "X"}).status_code == 401


def test_bob_never_sees_alices_rows(alice, bob):
    alice.put("/matchups", match_body("Alice secret"))
    alice.post("/lineups", team_body("Alice 4-4-2"))

    lib = bob.get("/library").get_json()
    assert lib["matchups"] == []
    assert lib["lineups"] == []


def test_bob_gets_404_not_403_on_alices_rows(alice, bob):
    """404, never 403 — a 403 would confirm the row exists, which is an
    existence oracle over another group's matchup names."""
    m = alice.put("/matchups", match_body("Alice secret")).get_json()
    l = alice.post("/lineups", team_body("Alice 4-4-2")).get_json()

    assert bob.delete(f"/matchups/{m['id']}").status_code == 404
    assert bob.delete(f"/lineups/{l['id']}").status_code == 404

    # And the rows are still there for Alice.
    assert len(alice.get("/library").get_json()["matchups"]) == 1
    assert len(alice.get("/library").get_json()["lineups"]) == 1


def test_same_name_in_two_groups_does_not_collide(alice, bob):
    a = alice.put("/matchups", match_body("Cup final"))
    b = bob.put("/matchups", match_body("Cup final"))
    assert a.status_code == 200
    assert b.status_code == 200, "a name taken in another group must not conflict"
    assert a.get_json()["id"] != b.get_json()["id"]


def test_writes_never_leak_into_another_group(alice, bob):
    bob.put("/matchups", match_body("Bob plan"))
    alice.put("/matchups", match_body("Alice plan"))
    assert [m["name"] for m in alice.get("/library").get_json()["matchups"]] == ["Alice plan"]
    assert [m["name"] for m in bob.get("/library").get_json()["matchups"]] == ["Bob plan"]


@pytest.mark.parametrize("field", ["group_id", "groupId", "gid"])
def test_a_supplied_group_is_ignored_in_body_query_and_header(alice, bob, app, field):
    """The group comes from the session and nowhere else. Try to smuggle one in
    through every channel a client controls."""
    with app.app_context():
        from db import db
        alice_gid = db().execute(
            "SELECT group_id FROM users WHERE username = 'alice'"
        ).fetchone()["group_id"]

    body = dict(match_body("Injected"))
    body[field] = alice_gid
    assert bob.put("/matchups", body).status_code == 200

    r = bob.c.put(
        f"/NickOnline/api/matchups?{field}={alice_gid}",
        json=match_body("Injected via query"),
        headers={"X-NickOnline": "1", field: str(alice_gid)},
    )
    assert r.status_code == 200

    # Everything landed in Bob's group; Alice's shelf is untouched.
    assert alice.get("/library").get_json()["matchups"] == []
    assert len(bob.get("/library").get_json()["matchups"]) == 2


def test_group_move_takes_effect_on_the_next_request(app, alice, admin):
    """Only the user id is in the cookie, so an admin's move lands immediately
    rather than at the user's next login."""
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    alice.put("/matchups", match_body("Personal note"))

    assert alice.post("/groups/join", {"code": grp["joinCode"]}).status_code == 200

    # New group, empty shelf — and the personal row did not follow.
    assert alice.get("/library").get_json()["matchups"] == []
    assert alice.get("/auth/me").get_json()["user"]["group"]["name"] == "Cerulean FC"

    # Going back finds the personal shelf exactly as it was.
    alice.post("/groups/leave")
    assert [m["name"] for m in alice.get("/library").get_json()["matchups"]] == ["Personal note"]


def test_group_mates_share_one_shelf(app, admin):
    from conftest import make_user

    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    a = make_user(app, "mia")
    b = make_user(app, "olav")
    a.post("/groups/join", {"code": grp["joinCode"]})
    b.post("/groups/join", {"code": grp["joinCode"]})

    a.put("/matchups", match_body("Shared plan"))
    seen = b.get("/library").get_json()["matchups"]
    assert [m["name"] for m in seen] == ["Shared plan"]
    assert seen[0]["savedBy"] == "mia", "rows record who saved them"

    # A shared shelf means any member may delete — stated, not accidental.
    assert b.delete(f"/matchups/{seen[0]['id']}").status_code == 200


def test_every_data_route_is_covered_by_this_file(app):
    """Structural guard: a new data endpoint must be added to DATA_ENDPOINTS."""
    covered = set(DATA_ENDPOINTS)
    missing = []
    for rule in app.url_map.iter_rules():
        if rule.rule in PUBLIC_ROUTES or "/admin/" in rule.rule:
            continue
        for method in rule.methods & {"GET", "POST", "PUT", "DELETE"}:
            if (method, rule.rule) not in covered:
                missing.append(f"{method} {rule.rule}")
    assert not missing, (
        "These routes touch group data but have no isolation test:\n  "
        + "\n  ".join(sorted(missing))
    )
