"""Both migrations use one copy mechanism: localStorage -> group, and personal
group -> shared group. Same skip-on-conflict policy, one thing to test."""

from conftest import EXAMPLE, match_body, team_body


def local_payload():
    return {
        "matchups": [
            {"name": "Local one", "savedAt": 1700000000000,
             "input": EXAMPLE, "corrections": {}},
            {"name": "Local two", "savedAt": 1700000001000,
             "input": EXAMPLE, "corrections": {}},
        ],
        "lineups": [
            {"id": "A-1", "name": "My 4-4-2", "side": "A",
             "savedAt": 1700000002000, "team": EXAMPLE["teamA"]},
        ],
    }


def test_local_import_adds_everything_once(alice):
    r = alice.post("/import/local", local_payload())
    assert r.get_json() == {"added": 3, "skipped": []}

    lib = alice.get("/library").get_json()
    assert sorted(m["name"] for m in lib["matchups"]) == ["Local one", "Local two"]
    assert lib["lineups"][0]["name"] == "My 4-4-2"


def test_a_second_local_import_is_a_reported_no_op(alice):
    alice.post("/import/local", local_payload())
    r = alice.post("/import/local", local_payload()).get_json()
    assert r["added"] == 0
    assert sorted(r["skipped"]) == ["A: My 4-4-2", "Local one", "Local two"]
    assert len(alice.get("/library").get_json()["matchups"]) == 2


def test_local_import_never_overwrites_a_colleagues_row(alice):
    alice.put("/matchups", match_body("Local one"))
    r = alice.post("/import/local", local_payload()).get_json()
    assert "Local one" in r["skipped"] and r["added"] == 2


def test_local_import_preserves_saved_at(alice):
    alice.post("/import/local", local_payload())
    rows = {m["name"]: m["savedAt"] for m in alice.get("/library").get_json()["matchups"]}
    assert rows["Local one"] == 1700000000000


def test_unreadable_local_rows_are_reported_not_swallowed(alice):
    bad = {"matchups": [{"name": "Corrupt", "savedAt": 1, "input": {"nope": 1},
                         "corrections": {}}], "lineups": []}
    r = alice.post("/import/local", bad).get_json()
    assert r["added"] == 0 and r["skipped"] == ["Corrupt (unreadable)"]


def test_personal_pending_is_zero_while_in_the_personal_group(alice):
    alice.put("/matchups", match_body())
    assert alice.get("/personal/pending").get_json() == {"matchups": 0, "lineups": 0}


def test_personal_import_copies_rather_than_moves(alice, admin):
    alice.put("/matchups", match_body("Private note"))
    alice.post("/lineups", team_body("Private 4-4-2"))
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    alice.post("/groups/join", {"code": grp["joinCode"]})

    assert alice.get("/personal/pending").get_json() == {"matchups": 1, "lineups": 1}
    assert alice.get("/library").get_json()["matchups"] == [], "nothing follows automatically"

    r = alice.post("/personal/import").get_json()
    assert r == {"added": 2, "skipped": []}
    assert [m["name"] for m in alice.get("/library").get_json()["matchups"]] == ["Private note"]

    # The originals stayed behind, so going back is not a dead end.
    alice.post("/groups/leave")
    assert [m["name"] for m in alice.get("/library").get_json()["matchups"]] == ["Private note"]


def test_personal_import_skips_names_already_in_the_shared_group(app, alice, admin):
    from conftest import make_user

    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    mia = make_user(app, "mia")
    mia.post("/groups/join", {"code": grp["joinCode"]})
    mia.put("/matchups", match_body("Cup final"))

    alice.put("/matchups", match_body("Cup final"))
    alice.post("/groups/join", {"code": grp["joinCode"]})
    r = alice.post("/personal/import").get_json()
    assert r["added"] == 0 and r["skipped"] == ["Cup final"]
    assert mia.get("/library").get_json()["matchups"][0]["savedBy"] == "mia"
