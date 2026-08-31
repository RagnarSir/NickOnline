"""Shape checks on stored payloads.

A shared shelf is a write channel from one group member into every other
member's simulate() call: the Scenario table and the lineup matrix run the
engine over every saved row. A payload carrying Infinity, a 5 MB blob or a
deeply nested object would break the whole group's page, so the check has to be
on the server — client-side validation is defeated by one curl.

This is availability, not XSS. React escapes the names.
"""

from __future__ import annotations

import math

MAX_NAME = 80
MAX_JSON_BYTES = 64 * 1024
MAX_DEPTH = 8
MAX_ARRAY = 32
MAX_STRING = 200
# Ratings, percentages and star counts all sit far inside this.
NUM_LIMIT = 1e6


def clean_name(raw) -> tuple[str | None, str | None]:
    if not isinstance(raw, str):
        return None, "Name is required"
    name = raw.strip()
    if not name:
        return None, "Name is required"
    if len(name) > MAX_NAME:
        return None, f"Name must be at most {MAX_NAME} characters"
    return name, None


def check_payload(value, depth: int = 0) -> str | None:
    """Walk an already-parsed JSON value. Returns an error message or None."""
    if depth > MAX_DEPTH:
        return "Payload is nested too deeply"
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        # bool is handled above; json gives ints and floats only.
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return "Payload contains a non-finite number"
        if abs(value) > NUM_LIMIT:
            return "Payload contains an out-of-range number"
        return None
    if isinstance(value, str):
        return "Payload contains an over-long string" if len(value) > MAX_STRING else None
    if isinstance(value, list):
        if len(value) > MAX_ARRAY:
            return "Payload contains an over-long list"
        for item in value:
            err = check_payload(item, depth + 1)
            if err:
                return err
        return None
    if isinstance(value, dict):
        if len(value) > 64:
            return "Payload has too many fields"
        for k, v in value.items():
            if not isinstance(k, str) or len(k) > 64:
                return "Payload has an invalid field name"
            err = check_payload(v, depth + 1)
            if err:
                return err
        return None
    return "Payload contains an unsupported value"


def check_size(blob: str) -> str | None:
    if len(blob.encode("utf-8")) > MAX_JSON_BYTES:
        return "Payload is too large"
    return None


def check_match_payload(payload) -> str | None:
    """{input: MatchInput, corrections: Corrections} — the body of a matchup."""
    if not isinstance(payload, dict):
        return "Expected an object"
    inp = payload.get("input")
    if not isinstance(inp, dict) or not isinstance(inp.get("teamA"), dict) \
            or not isinstance(inp.get("teamB"), dict):
        return "Expected input.teamA and input.teamB"
    if not isinstance(payload.get("corrections"), dict):
        return "Expected corrections"
    return check_payload(payload)


def check_team(team) -> str | None:
    """A TeamInput — the body of a lineup."""
    if not isinstance(team, dict):
        return "Expected an object"
    for key in ("att", "def"):
        if not isinstance(team.get(key), list):
            return f"Expected team.{key}"
    return check_payload(team)
