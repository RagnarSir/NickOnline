from conftest import make_user, match_body, team_body


def test_save_then_load(alice):
    r = alice.put("/matchups", match_body("Cup final"))
    assert r.status_code == 200
    row = r.get_json()
    assert row["name"] == "Cup final" and row["savedBy"] == "alice"
    assert row["input"]["teamA"]["att"] == [11.75, 13.5, 15.5]

    lib = alice.get("/library").get_json()
    assert len(lib["matchups"]) == 1


def test_same_name_conflicts_instead_of_silently_replacing(alice):
    """On a private shelf a silent overwrite was harmless. On a shared one it
    destroys a colleague's work, so it takes an explicit overwrite."""
    alice.put("/matchups", match_body("Cup final"))
    r = alice.put("/matchups", match_body("Cup final"))
    assert r.status_code == 409
    assert r.get_json()["existing"]["savedBy"] == "alice"

    r = alice.put("/matchups", {**match_body("Cup final"), "overwrite": True})
    assert r.status_code == 200
    assert len(alice.get("/library").get_json()["matchups"]) == 1


def test_conflict_names_the_colleague_who_saved_it(app, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    mia = make_user(app, "mia")
    olav = make_user(app, "olav")
    mia.post("/groups/join", {"code": grp["joinCode"]})
    olav.post("/groups/join", {"code": grp["joinCode"]})

    mia.put("/matchups", match_body("Cup final"))
    r = olav.put("/matchups", match_body("Cup final"))
    assert r.status_code == 409
    assert r.get_json()["existing"]["savedBy"] == "mia"

    # Overwriting re-attributes the row to whoever wrote it last.
    olav.put("/matchups", {**match_body("Cup final"), "overwrite": True})
    assert mia.get("/library").get_json()["matchups"][0]["savedBy"] == "olav"


def test_lineups_dedupe_per_side(alice):
    assert alice.post("/lineups", team_body("4-4-2", "A")).status_code == 200
    assert alice.post("/lineups", team_body("4-4-2", "B")).status_code == 200, \
        "the same name on the other side is a different lineup"
    assert alice.post("/lineups", team_body("4-4-2", "A")).status_code == 409


def test_delete(alice):
    row = alice.put("/matchups", match_body("Scratch")).get_json()
    assert alice.delete(f"/matchups/{row['id']}").status_code == 200
    assert alice.get("/library").get_json()["matchups"] == []
    assert alice.delete(f"/matchups/{row['id']}").status_code == 404


def test_saved_at_is_epoch_milliseconds(alice):
    import time
    row = alice.put("/matchups", match_body()).get_json()
    now_ms = time.time() * 1000
    assert abs(row["savedAt"] - now_ms) < 10_000, "must match the client's Date.now()"


def test_a_nameless_or_unreadable_payload_is_refused(alice):
    assert alice.put("/matchups", {"name": "", "input": {}, "corrections": {}}).status_code == 400
    assert alice.put("/matchups", {"name": "x", "input": {}, "corrections": {}}).status_code == 400
    assert alice.post("/lineups", {"name": "x", "side": "C", "team": {}}).status_code == 400
