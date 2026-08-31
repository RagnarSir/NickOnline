from conftest import make_user


def test_admin_routes_are_closed_to_regular_users(alice):
    assert alice.get("/admin/users").status_code == 403
    assert alice.post("/admin/groups", {"name": "Sneaky"}).status_code == 403
    assert alice.get("/admin/login-log").status_code == 403


def test_admin_routes_are_closed_to_anonymous(anon):
    assert anon.get("/admin/users").status_code == 401


def test_admin_sees_users_and_groups(app, alice, admin):
    data = admin.get("/admin/users").get_json()
    assert {u["username"] for u in data["users"]} == {"alice", "root"}
    assert data["groups"] == []
    admin.post("/admin/groups", {"name": "Cerulean FC"})
    assert admin.get("/admin/users").get_json()["groups"][0]["name"] == "Cerulean FC"


def test_admin_listing_never_leaks_password_hashes(alice, admin):
    body = admin.get("/admin/users").get_data(as_text=True)
    assert "password_hash" not in body and "pbkdf2" not in body and "scrypt" not in body


def test_the_last_admin_cannot_be_demoted_or_disabled(admin):
    me = next(u for u in admin.get("/admin/users").get_json()["users"]
              if u["username"] == "root")
    assert admin.post(f"/admin/users/{me['id']}/role", {"role": "user"}).status_code == 400
    assert admin.post(f"/admin/users/{me['id']}/disabled",
                      {"disabled": True}).status_code == 400


def test_a_second_admin_makes_demotion_possible(app, admin):
    make_user(app, "deputy")
    users = admin.get("/admin/users").get_json()["users"]
    deputy = next(u for u in users if u["username"] == "deputy")
    assert admin.post(f"/admin/users/{deputy['id']}/role", {"role": "admin"}).status_code == 200

    me = next(u for u in users if u["username"] == "root")
    assert admin.post(f"/admin/users/{me['id']}/role", {"role": "user"}).status_code == 200


def test_the_login_log_records_successes_and_failures(app, alice, admin):
    from conftest import Client
    c = Client(app.test_client())
    c.post("/auth/login", {"username": "alice", "password": "nope-nope"})
    events = admin.get("/admin/login-log").get_json()
    kinds = {e["event"] for e in events}
    assert "failed" in kinds and "signup" in kinds
