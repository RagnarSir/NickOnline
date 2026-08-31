from conftest import make_user, match_body


def test_join_code_moves_the_user(app, alice, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    assert grp["joinCode"]
    r = alice.post("/groups/join", {"code": grp["joinCode"]})
    assert r.status_code == 200
    assert r.get_json()["user"]["group"]["name"] == "Cerulean FC"


def test_join_code_is_case_insensitive_on_entry(alice, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    assert alice.post("/groups/join", {"code": grp["joinCode"].lower()}).status_code == 200


def test_a_bad_code_reveals_nothing(alice):
    r = alice.post("/groups/join", {"code": "XXXX-XXXX"})
    assert r.status_code == 404


def test_a_revoked_code_stops_working(alice, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    code = grp["joinCode"]
    admin.post(f"/admin/groups/{grp['id']}/code", {"revoke": True})
    assert alice.post("/groups/join", {"code": code}).status_code == 404


def test_a_rotated_code_stops_working(alice, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    old = grp["joinCode"]
    new = admin.post(f"/admin/groups/{grp['id']}/code").get_json()["joinCode"]
    assert new != old
    assert alice.post("/groups/join", {"code": old}).status_code == 404
    assert alice.post("/groups/join", {"code": new}).status_code == 200


def test_a_use_limited_code_runs_out(app, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    admin.post(f"/admin/groups/{grp['id']}/code", {"maxUses": 1})
    code = admin.get("/admin/users").get_json()["groups"][0]["joinCode"]

    assert make_user(app, "mia").post("/groups/join", {"code": code}).status_code == 200
    assert make_user(app, "olav").post("/groups/join", {"code": code}).status_code == 404


def test_shared_group_names_are_unique(admin):
    assert admin.post("/admin/groups", {"name": "Cerulean FC"}).status_code == 200
    assert admin.post("/admin/groups", {"name": "cerulean fc"}).status_code == 400


def test_joining_twice_is_refused(alice, admin):
    grp = admin.post("/admin/groups", {"name": "Cerulean FC"}).get_json()
    alice.post("/groups/join", {"code": grp["joinCode"]})
    assert alice.post("/groups/join", {"code": grp["joinCode"]}).status_code == 400
