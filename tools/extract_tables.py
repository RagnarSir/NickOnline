#!/usr/bin/env python3
"""Extract the Simulator_v5_1.xlsx lookup tables into JSON for the web engine.

Emits:
  src/data/tables.json          the live lookup subset the model actually reads
  tests/fixtures/golden.json    every cached value on the `simulator` sheet, plus
                                the workbook's saved input state, for the parity test

Re-run this if the workbook is ever updated:  python3 tools/extract_tables.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_read import Workbook, num_to_col  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "Simulator_v5_1.xlsx")

wb = Workbook(XLSX)
LK = "lkup_simul"


def pairs(sheet, keycol, valcol, r0, r1):
    """Ascending [key, value] pairs for an approximate (TRUE) VLOOKUP."""
    ks = wb.column(sheet, keycol, r0, r1)
    vs = wb.column(sheet, valcol, r0, r1)
    out = []
    for k, v in zip(ks, vs):
        if isinstance(k, float) and isinstance(v, float):
            out.append([k, v])
    out.sort(key=lambda p: p[0])
    return out


def exact(sheet, keycol, valcol, r0, r1, key_str=False):
    """Dict for an exact-match (FALSE) VLOOKUP. Keys stringified for JSON."""
    ks = wb.column(sheet, keycol, r0, r1)
    vs = wb.column(sheet, valcol, r0, r1)
    out = {}
    for k, v in zip(ks, vs):
        if k is None or not isinstance(v, float):
            continue
        if isinstance(k, str):
            if not key_str:
                continue
            out[k] = v
        else:
            if key_str:
                continue
            out[fmt_num_key(k)] = v
    return out


def fmt_num_key(x):
    """Stable numeric key: 5.0 -> '5', 7.25 -> '7.25'."""
    return str(int(x)) if float(x).is_integer() else repr(round(float(x), 10))


# --------------------------------------------------------------------------
# Approximate curves  (VLOOKUP ..., TRUE  ->  last key <= target)
# --------------------------------------------------------------------------
approx = {
    # key = (own ISP Att - opp ISP Def) * 4
    "ifkConv": pairs(LK, "A", "B", 8, 68),
    # key = own Long Shots tactic level; col 5 of N:S is the smoothed rate
    "lsConv": pairs(LK, "N", "R", 2, 29),
    # key = combined Play Creatively level; col 8 of AA:AI
    "pcFactor": pairs(LK, "AA", "AH", 2, 33),
    # key = Attack in Middle / on Wings level; col 8 of each block
    "aimShift": pairs(LK, "CH", "CO", 5, 19),
    "aowShift": pairs(LK, "CQ", "CX", 5, 21),
    # key = head-specialist count gap
    "cornerHeadConv": pairs(LK, "DA", "DB", 5, 22),
    # key = ISP gap * 4
    "ispFactorHead": pairs(LK, "DH", "DI", 5, 82),
    "ispFactorCorner": pairs(LK, "EE", "EF", 5, 76),
    # key = opposing keeper stars, for corner-to-anyone
    "kFactorCorner": pairs(LK, "EB", "EC", 3, 23),
    # key = own LS level / opponent Pressing level
    "lsPressed": pairs(LK, "FP", "FQ", 3, 19),
    "pressAdj": pairs(LK, "FS", "FT", 3, 12),
    # extra-time draw model
    "drawEtByAvgXg": pairs(LK, "GX", "GY", 7, 19),
    "drawEtByGap": pairs(LK, "HA", "HB", 7, 28),
    # key = ISP Att gap * 4
    "pkShootout": pairs(LK, "HD", "HE", 5, 35),
}

# --------------------------------------------------------------------------
# Exact-match tables  (VLOOKUP ..., FALSE)
# --------------------------------------------------------------------------
lsdist_keys = wb.column(LK, "BY", 5, 32)
lsdist_ce = wb.column(LK, "CE", 5, 32)
lsdist_cf = wb.column(LK, "CF", 5, 32)

exact_tables = {
    "pdimStopped": exact(LK, "D", "E", 8, 11),
    # NB keys are 2..18 plus 0; there is deliberately no key 1
    "pressingChancesRemoved": exact(LK, "G", "H", 8, 26),
    # key = "<own PNF count>_<opposing central defender count>"
    "pnfFreq": exact(LK, "W", "X", 4, 20, key_str=True),
    # BH:BI is heterogeneous: "2D".."5D" then numeric CA levels. Split it.
    "caPctByDefenders": exact(LK, "BH", "BI", 2, 79, key_str=True),
    "caPctByLevel": exact(LK, "BH", "BI", 2, 79),
    "sePlayerFactor": exact(LK, "DP", "DS", 3, 13),
    "seCornerHeadFactor": exact(LK, "DP", "DT", 3, 13),
    "techDefCaBonus": exact(LK, "GI", "GM", 2, 7),
    "htsDef": exact("hts_calculator", "A", "B", 2, 480),
    "htsAtt": exact("hts_calculator", "D", "E", 2, 480),
    "htsMid": exact("hts_calculator", "G", "H", 2, 480),
    "htsLs": exact("hts_calculator", "J", "K", 2, 480),
}

# % of chances that are long shots: col 7 + col 8 of BY:CF, keyed on LS level
exact_tables["lsDist"] = {
    fmt_num_key(k): {"tactic": ce, "nonTactic": cf}
    for k, ce, cf in zip(lsdist_keys, lsdist_ce, lsdist_cf)
    if isinstance(k, float)
}

# Possession linearisation: 101 exact keys 0.00..1.00, stored as a dense array
# indexed by round(p * 100) so no float key formatting is involved.
poss_k = wb.column(LK, "GP", 2, 102)
poss_v = wb.column(LK, "GQ", 2, 102)
possession_linear = [None] * 101
for k, v in zip(poss_k, poss_v):
    if isinstance(k, float) and isinstance(v, float):
        possession_linear[round(k * 100)] = v
assert all(x is not None for x in possession_linear), "possession table has holes"

# --------------------------------------------------------------------------
# Matrices
# --------------------------------------------------------------------------
# conv_Kstars!CB6:CY27 -- HLOOKUP on opposing keeper stars (exact), row picked
# by the simulator's AY index. AY=n addresses sheet row 5+n.
gk_header = [v for v in wb.block("conv_Kstars", "CB", "CY", 6, 6)[0]]
conv_rows = {}
for ay in range(4, 23):
    row = wb.block("conv_Kstars", "CB", "CY", 5 + ay, 5 + ay)[0]
    if any(isinstance(v, float) for v in row):
        conv_rows[str(ay)] = row

# dfk_pk: three 12x12 matrices sharing one row axis and one column-breakpoint axis
dfk = {
    "attKeys": [r[0] for r in wb.block("dfk_pk", "A", "A", 8, 19)],
    "defBreakpoints": wb.block("dfk_pk", "D", "O", 4, 4)[0],
    "pk": wb.block("dfk_pk", "D", "O", 8, 19),
    "dfk": wb.block("dfk_pk", "S", "AD", 8, 19),
    "pkShare": wb.block("dfk_pk", "AH", "AS", 8, 19),
}

# --------------------------------------------------------------------------
# Constants that live on the simulator sheet itself
# --------------------------------------------------------------------------
constants = {
    "baseNormalChances": wb.val("simulator", "U2"),          # 10
    "distLeft": wb.val("simulator", "T7"),                   # 0.259
    "distCenter": wb.val("simulator", "T8"),                 # 0.357
    "distRight": wb.val("simulator", "T9"),                  # 0.259
    "distSetPiece": wb.val("simulator", "T10"),              # 0.084  (DFK + PK)
    "distIfk": wb.val("simulator", "T12"),                   # 0.041
    "pnfConv": wb.val("simulator", "V14"),                   # 0.8
    "defaultPcExponent": wb.val("simulator", "AN2"),         # 3.5
    "allOthersSplit": wb.val("simulator", "AN18"),           # 0.5
    "sectorConvCap": 0.92,
    "seBaseFreq": {},
    "seConvRow": {},
}
for r in range(5, 19):
    constants["seBaseFreq"][str(r)] = wb.val("simulator", "AK%d" % r)
    ay = wb.val("simulator", "AY%d" % r)
    if isinstance(ay, float):
        constants["seConvRow"][str(r)] = int(ay)

tables = {
    "_source": "Simulator_v5_1.xlsx  (generated by tools/extract_tables.py)",
    "constants": constants,
    "approx": approx,
    "exact": exact_tables,
    "possessionLinear": possession_linear,
    "convKstars": {"gkStars": gk_header, "rows": conv_rows},
    "dfkPk": dfk,
    "htsWeights": {
        r[0]: {"side": r[1], "middle": r[2]}
        for r in wb.block("hts_calculator", "M", "O", 2, 4)
    },
    "htsn": {
        "manmarking": {fmt_num_key(r[0]): r[1] for r in wb.block("hts_calculator", "M", "N", 9, 11)},
        "location": {r[0]: r[1] for r in wb.block("hts_calculator", "M", "N", 14, 18)},
        "extraTime": {r[0]: r[1] for r in wb.block("hts_calculator", "M", "N", 20, 21)},
    },
}

# --------------------------------------------------------------------------
# Golden fixture: every cached value on the simulator sheet + the saved inputs
# --------------------------------------------------------------------------
sim = wb.sheet("simulator")
cells = {}
for (ci, ri), cell in sim.items():
    v = cell["v"]
    if isinstance(v, (float, str)):
        cells["%s%d" % (num_to_col(ci), ri)] = v

SPEC_ROWS = {"fw": 11, "mid": 12, "def": 13, "gk": 14}


def team_inputs(row, spec_offset):
    """row 7 = Team A, row 8 = Team B; spec_offset 0 = A (rows 11-14), 6 = B (17-20)."""
    att_row, mid_row, def_row = (14, 15, 16) if spec_offset == 0 else (18, 19, 20)
    grid = {}
    for name, base in SPEC_ROWS.items():
        r = base + spec_offset
        grid[name] = [wb.val("simulator", "%s%d" % (c, r)) for c in ("I", "J", "K", "L", "M")]
    return {
        "possession": wb.val("simulator", "C%d" % row),
        "percentConv": [wb.val("simulator", "%s%d" % (c, row)) for c in ("D", "E", "F")],
        "att": [wb.val("simulator", "%s%d" % (c, att_row)) for c in ("D", "E", "F")],
        "mid": wb.val("simulator", "E%d" % mid_row),
        "def": [wb.val("simulator", "%s%d" % (c, def_row)) for c in ("D", "E", "F")],
        "ispDef": wb.val("simulator", "I%d" % row),
        "ispAtt": wb.val("simulator", "J%d" % row),
        "gkStars": wb.val("simulator", "K%d" % row),
        "tacticLevel": wb.val("simulator", "L%d" % row),
        "tactic": wb.val("simulator", "M%d" % row),
        "specialties": grid,
    }


golden = {
    "_source": "Simulator_v5_1.xlsx saved state (generated by tools/extract_tables.py)",
    "input": {
        "ratingsMode": wb.val("simulator", "D4"),
        "specialtiesMode": wb.val("simulator", "J4"),
        "extraTime": wb.val("simulator", "E25"),
        "manmarking": wb.val("simulator", "E26"),
        "teamA": dict(team_inputs(7, 0), location=wb.val("simulator", "E24")),
        "teamB": dict(team_inputs(8, 6), location=wb.val("simulator", "F24")),
    },
    "cells": cells,
}

os.makedirs(os.path.join(REPO, "src", "data"), exist_ok=True)
os.makedirs(os.path.join(REPO, "tests", "fixtures"), exist_ok=True)

out_tables = os.path.join(REPO, "src", "data", "tables.json")
out_golden = os.path.join(REPO, "tests", "fixtures", "golden.json")
out_example = os.path.join(REPO, "src", "data", "example.json")
with open(out_tables, "w") as f:
    json.dump(tables, f, separators=(",", ":"))
with open(out_golden, "w") as f:
    json.dump(golden, f, indent=1)
# The same saved state the parity test uses, so the app can show it as an example.
with open(out_example, "w") as f:
    json.dump(golden["input"], f, indent=1)

n_numbers = (
    sum(len(v) * 2 for v in approx.values())
    + sum(len(v) for v in exact_tables.values())
    + len(possession_linear)
    + sum(len(r) for r in conv_rows.values())
    + 12 * 12 * 3
)
print("tables.json  %6.1f KB  (~%d numbers)" % (os.path.getsize(out_tables) / 1024, n_numbers))
print("golden.json  %6.1f KB  (%d simulator cells)" % (os.path.getsize(out_golden) / 1024, len(cells)))
