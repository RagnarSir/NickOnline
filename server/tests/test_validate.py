"""A shared shelf is a write channel into every group member's simulate() call,
so a payload that breaks the engine breaks the whole group's page."""

import json

from conftest import EXAMPLE, match_body


def test_the_real_workbook_example_is_accepted(alice):
    """Reads src/data/example.json, so an engine type change that the validator
    would reject fails here rather than in production."""
    assert alice.put("/matchups", match_body()).status_code == 200


def test_non_finite_numbers_are_refused(alice):
    body = json.loads(json.dumps(match_body("NaN attack")))
    body["input"]["teamA"]["att"][0] = float("inf")
    r = alice.c.put("/NickOnline/api/matchups",
                    data=json.dumps(body).replace('Infinity', 'Infinity'),
                    content_type="application/json",
                    headers={"X-NickOnline": "1"})
    assert r.status_code == 400


def test_absurd_numbers_are_refused(alice):
    body = match_body("Huge")
    body["input"]["teamA"]["att"] = [1e12, 1, 1]
    assert alice.put("/matchups", body).status_code == 400


def test_over_long_names_are_refused(alice):
    assert alice.put("/matchups", match_body("x" * 81)).status_code == 400
    assert alice.put("/matchups", match_body("x" * 80)).status_code == 200


def test_over_long_strings_inside_the_payload_are_refused(alice):
    body = match_body("Long name inside")
    body["input"]["teamA"]["tactic"] = "x" * 500
    assert alice.put("/matchups", body).status_code == 400


def test_deeply_nested_payloads_are_refused(alice):
    body = match_body("Deep")
    nested = {}
    cur = nested
    for _ in range(12):
        cur["a"] = {}
        cur = cur["a"]
    body["input"]["teamA"]["specialties"] = nested
    assert alice.put("/matchups", body).status_code == 400


def test_a_huge_body_is_refused_by_flask(alice):
    body = match_body("Fat")
    body["input"]["teamA"]["junk"] = "x" * 300_000
    r = alice.put("/matchups", body)
    assert r.status_code in (400, 413)
