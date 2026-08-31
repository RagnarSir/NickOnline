"""Crude, and it catches the exact mistake that matters.

The whole isolation story rests on one rule: a group id is read from the
session, never from the request. This walks the source looking for a line where
those two ideas meet.
"""

import re
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
SOURCES = sorted(p for p in SERVER.glob("*.py") if p.name != "conftest.py")

GROUPISH = re.compile(r"\b(group_id|groupId|\bgid\b)", re.I)
FROM_REQUEST = re.compile(r"(request\.(args|form|values|json|headers)|get_json\(|\bbody\(\))")


def test_no_group_id_is_ever_read_from_a_request():
    offenders = []
    for path in SOURCES:
        for n, line in enumerate(path.read_text().splitlines(), 1):
            code = line.split("#", 1)[0]
            if GROUPISH.search(code) and FROM_REQUEST.search(code):
                offenders.append(f"{path.name}:{n}: {line.strip()}")
    assert not offenders, (
        "A group id must come from the session, never the request:\n  "
        + "\n  ".join(offenders)
    )


def test_library_is_the_only_module_touching_group_owned_tables():
    """Keeping the SQL in one module is what makes the gid-first convention
    reviewable at a glance."""
    offenders = []
    for path in SOURCES:
        if path.name in ("library.py", "db.py", "cli.py"):
            continue
        text = path.read_text()
        for table in ("FROM matchups", "INTO matchups", "FROM lineups", "INTO lineups"):
            if table in text:
                offenders.append(f"{path.name} contains {table!r}")
    assert not offenders, "\n".join(offenders)


def test_every_library_function_takes_gid_first():
    import ast

    tree = ast.parse((SERVER / "library.py").read_text())
    bad = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
            args = [a.arg for a in node.args.args]
            if not args or args[0] not in ("gid", "src_gid"):
                bad.append(f"{node.name}({', '.join(args)})")
    assert not bad, "library functions must take the group id first:\n  " + "\n  ".join(bad)
