# NickOnline

A web port of **Simulator_v5_1.xlsx** — nickarana's Hattrick match simulator.
Enter both teams' ratings (or sector percentages), set pieces, keeper, tactic and player
specialties; get xG, xP, HTS, a goal distribution and win/draw/loss probabilities.

The model is deterministic and analytic — no Monte Carlo, no randomness. Same input, same
output, every time.

## What it is

- **Single-page app plus a small accounts API.** React 18 + Vite + strict TypeScript +
  Zustand in the browser; Flask + SQLite behind gunicorn on the server. The *calculator*
  is still entirely client-side and needs no account — the API exists only so a group of
  people can share a library of saved matchups and lineups.
- **Exact parity with v5.1 by default.** The engine reproduces the workbook cell for cell;
  `tests/engine.golden.test.ts` asserts ~150 intermediates plus the headline numbers against
  the workbook's own cached values, to 1e-12.
- The workbook itself is kept in the repo as the source of truth. **Never hand-edit
  `src/data/*.json`** — regenerate them.

## Files

```
Simulator_v5_1.xlsx        source of truth — the model and its lookup tables
tools/xlsx_read.py         minimal stdlib .xlsx reader (no openpyxl on this machine)
tools/extract_tables.py    xlsx -> src/data/tables.json, src/data/example.json,
                           tests/fixtures/golden.json
src/engine/                the whole model, pure TypeScript, zero React imports
  types.ts                 MatchInput, Corrections, MatchResult
  lookup.ts                Excel VLOOKUP/HLOOKUP semantics + diagnostics
  tables.ts                typed view over the generated JSON
  squad.ts                 specialty-grid counting (the COUNTIF/COUNTA ranges)
  ratings.ts               rating -> level, possession, sector conversion
  hts.ts                   HTS and HTSN
  chances.ts               chance funnel and the sector table
  specialEvents.ts         the 14-row special-events table
  outcome.ts               Poisson grid, extra time, shootout
  simulate.ts              orchestrates it all in the workbook's dependency order
src/lib/ratingNames.ts     numeric rating -> "magnificent (high)"
src/import/parseHattrick   Hattrick BBCode -> Partial<TeamInput> (pure, no React)
src/components/
  Scoreboard/              sticky live result: most likely scoreline + odds
  Pitch/PitchPanel         ratings entered as attack-v-mirrored-defence duels
  TeamPanel/               set pieces, tactic, specialty grid, ground
  Results/*                outcome bars, charts, breakdown tables
  Import/ImportPanel       paste Hattrick BBCode, review, apply to Team A
  Corrections/, ThemeToggle/, Help/
  Lineups/                 per-side lineup library + the A x B win-probability matrix
  Scenarios/ScenarioTable  every saved matchup on one sortable screen
src/store/matchStore.ts    Zustand state; the library half calls the API
src/store/authStore.ts     who is signed in, and which group they act in
src/api/client.ts          the only fetch wrapper; owns the 401 handler
src/migrate/localLibrary   reads the pre-accounts localStorage keys, for a one-time import
src/share.ts               match state <-> URL hash
server/                    the accounts API (Flask + SQLite), see "Accounts" below
  schema.sql               groups, users, matchups, lineups, login_events, rate_limit
  db.py                    connections, schema, the persisted session secret
  auth.py                  sessions, identity, login_required/admin_required
  library.py               THE ONLY module that touches group-owned rows
  validate.py              payload shape checks
  ratelimit.py             SQLite-backed throttling (multi-worker safe)
  app.py                   routes
  cli.py                   initdb / promote / users, over ssh
  tests/                   pytest; test_isolation.py is the important one
deploy.py                  idempotent deploy to the OVH box
```

## Commands

```bash
npm install
npm run dev          # http://localhost:5173/NickOnline/
npm run dev:api      # the accounts API on :8008 (second terminal; vite proxies to it)
npm test             # the parity suite — run this after ANY engine change
npm run test:py      # the API suite — run this after ANY server change
npm run test:all     # both, in the order deploy.py runs them
npm run build        # tsc && vite build
npm run tables       # regenerate src/data/*.json from the workbook
npm run howto        # regenerate HOWTO.md from src/help/guide.json
npm run howto:check  # fail if HOWTO.md is out of date
```

## The How-to — keep it current

**`src/help/guide.json` is the single source of the user documentation.** The in-app
*How to use* panel renders it, and `HOWTO.md` is generated from it. Never edit `HOWTO.md`
by hand; never write user-facing prose into the components.

**Any change that a user can see — a new control, a renamed label, a changed workflow, a
new result — must be matched by an edit to `guide.json` in the same change.** That is the
rule; the tooling only reminds you of it:

- A `PostToolUse` hook (`.claude/settings.json` -> `tools/guide_hook.py`) fires on every
  Write/Edit. Touch `src/components/**`, `src/store/**`, `App.tsx`, `engine/types.ts` or
  `share.ts` without having touched `guide.json`, and it says so. Touch `guide.json` and it
  regenerates `HOWTO.md` for you.
- `npm run howto:check` fails when `HOWTO.md` has drifted — the CI-shaped version of the
  same check.

The hook is advisory by design: only a human or the model can tell whether a given change
is user-visible. It loads for sessions started inside this project directory.

## Accounts, groups and isolation

Several people use this, and some of them play each other. The whole feature exists so
that **no group can see another group's saved work** — everything else is plumbing.

- **The calculator stays public.** Anonymous visitors get the pitch, the results and
  `#m=` share links, with no API call but `/auth/me`. Only *saving* needs an account.
- **Sign-up is open**; a new account gets its own `personal` group and can see nothing
  else. Membership of a *shared* group comes from a **join code** an admin hands over
  out of band — not from an admin picking a username off a list, which with open sign-up
  cannot tell `ragnar77` from `ragnar_77`.
- **Rows never move between groups.** `matchups.group_id` is set at write time and is
  immutable; joining a group changes `users.group_id` only. That is what makes "nothing
  is published by surprise" structural instead of a promise. The Account panel *offers*
  to copy a personal library across, and copies rather than moves, so leaving later is
  not a dead end.

### The rule that must not be broken

**A group id comes from the session and nowhere else.** The cookie carries only
`{uid, pwv}`; `auth.load_identity()` re-reads the user row on every request and derives
`g.gid` from it. Re-reading (one indexed lookup on local WAL SQLite) is what makes an
admin's change take effect on the user's *next request* rather than their next login — a
session pinned to a stale group id would keep writing into the old group, which is
exactly the leak this feature exists to prevent.

`server/library.py` is the only module that touches `matchups` or `lineups`, and `gid` is
every function's first parameter. Three tests defend this and all of them fail the deploy:

- `test_isolation.py` walks `app.url_map` and **fails if any data route is missing from
  its coverage table** — so a new endpoint cannot be added without testing its scoping.
- It also pins that `group_id` / `groupId` / `gid` in the body, query string or headers is
  ignored on every endpoint.
- `test_source_guard.py` greps the source for a group id read from a request, and asserts
  every `library.py` function takes `gid` first.

A row that is not yours returns **404, never 403** — a 403 confirms the row exists, which
is an existence oracle over another group's matchup names.

### Things that are deliberate, not oversights

- **Any group member can delete any row.** That follows from "the library is shared". The
  `savedBy` byline makes authorship visible without making it a permission.
- **Saving over a name asks first** (409 + explicit `overwrite`). A silent replace was
  harmless on a private shelf and destroys a colleague's work on a shared one.
- **`#m=` share links bypass groups entirely.** They are capability URLs: anyone holding
  one sees that matchup. This is stated in `guide.json`; do not let it drift.
- **No first-run `/setup` page.** RagCheat can have one because its sign-up is closed;
  here it would be a land grab. Promotion is `cli promote <username>` over ssh, and
  `deploy.py` prints the command when no admin exists.

### The accepted risk

The OVH vhost is **shared with other apps, so it is a shared origin.** Namespacing the
cookie (`nickonline_session`, `Path=/NickOnline/`) stops it colliding with theirs, but a
cookie path is not a security boundary: an XSS in any other app on that hostname could
issue a same-origin `fetch('/NickOnline/api/…')` and act as the signed-in user. `HttpOnly`,
`SameSite=Lax` and the `X-NickOnline` header all fail to help. The only real fix is a
separate hostname. Given the data is Hattrick lineups this is accepted — but it is
accepted, not unnoticed, and it changes if the data ever gets more sensitive.

Lifted from RagCheat (`/home/ragnar/Claude/CursorTest/ht_analyzer/app.py`): the persisted
session secret, Werkzeug hashing, `session.clear()` before every populate, the
`login_required` / `admin_required` shape, rightmost-XFF client IP, and the login audit
log. Groups, persistence and rate limiting are new here — RagCheat has none of them.

## Design notes

- **The pitch panel is the point.** Every sector conversion is own-attack against the
  *mirrored* opposing defence (left meets right). The input lays each attack sector directly
  above the defender it actually faces, so the model's central mechanic is visible rather than
  buried in `ratings.ts`. `FACES = [2, 1, 0]` is that mirror — keep it in step with
  `ratingsSectorConv()`.
- **Ratings are shown in Hattrick's own words** via `src/lib/ratingNames.ts`. The scale is
  **zero-based**: `non-existent = 0` … `divine = 20`, so `12.5` is *magnificent (high)*. This
  shipped wrong once (indexed one level too low) — the fix is anchored in
  `tests/ratingNames.test.ts` to three things Hattrick states itself: it reports
  `world class (13)`, `formidable (9)`, and calls `12.5` *magnificent (high)*. Tactic and
  formation levels use the same numbering, which is why the import can read `(13)` literally
  instead of needing a name table.
- **Teams are named by the user.** Nothing in the engine reads `TeamInput.name`; it only
  labels output, so colour is never the sole identifier of a series.
- Type: IBM Plex Sans / Sans Condensed / Mono. Condensed carries labels and headings, mono
  carries every figure so columns align. Series colours are the validated `dataviz` palette
  (blue/orange), checked in both light and dark against their own surfaces.
- In **Percent mode** the attack/defence ratings are hidden from the pitch but still drive HTS
  and the counter-attack model, so each team panel keeps them behind a disclosure.
- **The matrix uses a diverging scale, not sequential.** Win probability has a meaningful
  midpoint (an even match), so hue carries *who is favoured* — blue for A, orange for B, grey
  at 50% — and saturation carries *by how much*. The number is always printed, so colour is
  never the only channel. Ink is a single per-theme token (`--div-ink`) because the light
  palette is tints and the dark palette is shades.

## Importing from Hattrick

`src/import/parseHattrick.ts` parses the two BBCode blocks Hattrick puts on the clipboard —
one for ratings, one for the lineup. Pure functions; the panel and the store do the applying.

**Hattrick orders sectors Right → Left** (`RB … LB`, and the ratings rows to match); this app
orders them Left → Right. Every row is reversed on import, once, in `LINE_SLOTS` and in the two
`ratingRow` reversals. This is the highest-risk detail in the feature: a missed flip still
produces entirely plausible numbers. `tests/parseHattrick.test.ts` pins it against the real
clipboard output in `tests/fixtures/hattrick-{ratings,lineup}.txt` — **keep those fixtures
verbatim**, they are evidence, not samples.

Other things the parser has to get right:
- `-` in a slot is an **empty slot** (`''`), not a player without a specialty (`'Z'`).
- `Powerful` is position-dependent: `PNF` on a forward, `PDIM` on an inner midfielder, and
  unrepresentable anywhere else (warns).
- Only the **first** table is the starting XI; split on `Substitutes` before parsing.
- `▲ ▶` prefixes are individual orders — stripped from names.
- Set-piece ratings and keeper stars are in neither copy. `applyImport` merges only the keys
  present, then flags those three fields via `needsAttention`.

## Comparing lineups

Two mechanisms, deliberately distinct:

- **Lineup library + matrix** (`src/components/Lineups/`) — save a *single side's* setup, build
  up a shelf per team, then every A x B pairing is simulated and shown as a grid of Team A win
  probabilities. `Average` and `Worst case` columns support a maximin pick when you can't
  predict the opponent. Clicking a cell loads that pairing. Match-level settings (input mode,
  cup rules, corrections) come from the current match, not the saved lineup — only `TeamInput`
  is stored.
- **Scenario table** (`src/components/Scenarios/`) — every saved *whole matchup*, sortable, for
  one-off what-ifs that don't fit a grid sweep.

The two agree by construction: a saved matchup and the equivalent matrix cell run the same
`simulate()` on the same inputs. That makes them a useful cross-check on each other.

Local visual check (headless Chrome, the house pattern):

```bash
npm run build && npx vite preview --port 8791 --host 127.0.0.1 &
google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --virtual-time-budget=4000 --window-size=1280,3400 \
  --screenshot=shot.png "http://127.0.0.1:8791/NickOnline/"
```

## The acceptance criterion

With corrections **off**, the workbook's saved state must reproduce:

```
Win A 0.69244254482418643 · Draw 0.190991628369096 · Win B 0.11656582680671748
xG    2.0913467912928296  vs 0.71968398063764982
HTS   293.30402873397122  vs 345.05153703079947
```

The **Load v5.1 example** button in the app loads exactly that state.

## Known v5.1 defects (shipped off by default)

Four real bugs were found while porting. Each is an independent flag in `Corrections`,
**off by default** so results match the spreadsheet, and each is explained in the app's
"Model corrections" panel.

| Flag | v5.1 behaviour |
|---|---|
| `afterPk` | `P6`/`R6` reference the empty cells `P46`/`R46`, so "After PK" silently echoes the 90' result and the computed shootout odds (`P5`/`R5`) are never used. |
| `teamBCounterAttacks` | `AF4 = AA16*AF2` drops the U-specialist term that `Z4` has. Only visible when Team A has Unpredictable players. |
| `teamBHtsWeights` | `BC5` builds Team B's attack from Team A's tactic weights; the correct `BG12`/`BH12` are computed and referenced by nothing. |
| `aimCentreWeight` | `BF12`'s Attack-in-Middle branch returns the side weight (0.25) for the middle, so the weights sum to 0.75. |

A fifth flag, `percentLinearise`, is a deliberate extension rather than a bug fix: v5.1's
26 Oct 2025 fix linearised possession for corner events but left the counter-attack gate and
the extreme-CA midfield test reading the Ratings cells. This applies the same inversion there.

## Porting gotchas

These bit during the port and will bite again:

- **Shared formulas.** Excel stores fill-down ranges once; `tools/xlsx_read.py` expands them
  (`translate()`). A reader that ignores them silently sees blank cells.
- **Exact vs approximate lookups.** The workbook mixes `VLOOKUP(...,FALSE)` and `(...,TRUE)`
  deliberately. Never substitute interpolation for an exact match.
- **`conv_Kstars` columns are the *opposing keeper's* stars**, not attack stars, and the match
  is exact — GK stars must land on `{0, 1.5, 2, ..., 12.5}`.
- **`hts_calculator` keys** are `1000 * tacticCode + floor(rating*4 - 3)`, where tacticCode is
  9 normal / 2 counter-attacks / 8 long shots / 3 extreme-CA. The DEF prefix-8 block starts at
  **8002**, not 8001 — key off the literal, never a row offset.
- **`'Z'` is not a blank cell.** `COUNTA` counts a player with no specialty but not an empty
  slot, so a blank winger silently suppresses the winger events.
- **Team A and Team B are not symmetric in the source.** Team A gates the long-shot share on
  the tactic *name*, Team B on the *level*; corner-to-head counts heads differently for the
  attacking and defending sides. These asymmetries are ported as-is.
- HTSN (home/away, extra time, man-marking) is **display only** — nothing downstream reads it,
  so location does not move the odds.

## GitHub

Public at **https://github.com/RagnarSir/NickOnline**.

Two things keep it current, and neither pushes behind your back:

- **`deploy.py` commits and pushes as its last step**, so what is published always matches what
  is live. `--no-push` skips it. It never fails the deploy over a git problem.
- **A `Stop` hook (`tools/git_reminder.py`)** reports uncommitted or unpushed work at the end
  of a session. Advisory only.

Kept out of the repo on purpose (`.gitignore`):

| Path | Why |
|---|---|
| `deploy_local.py` | The server, user and SSH key names. Public repo; addresses are not. |
| `*.xlsx.bak` | Backup from `tools/scrub_workbook.py`, which holds the un-scrubbed metadata. |

`tools/scrub_workbook.py` strips the author name and the last-saved absolute path from the
workbook's file metadata — it is committed, so its metadata is published too. Run
`python3 tools/scrub_workbook.py --check` if a fresh copy of the workbook is ever dropped in;
it exits non-zero when there is something to remove. Scrubbing touches metadata only, and the
proof is that `npm run tables` reproduces byte-identical output and the parity suite still
passes.

Hook commands use **relative paths** (`python3 tools/git_reminder.py`) so a clone works without
editing, and so no home directory ends up in a public file. They run from the project root.

## Deployment

```bash
python3 deploy.py             # test, build, rsync, venv, systemd, nginx, verify, push
python3 deploy.py --no-build  # ship the existing dist/ as-is (still runs the tests)
python3 deploy.py --no-test   # skip the suites — has to be typed on purpose
python3 deploy.py --no-push   # skip the git commit and push
python3 deploy.py --logs      # tail the API service log
```

**Where it deploys lives in `deploy_local.py`, which is gitignored** — this repo is public
and the addresses are not. Copy `deploy_local.example.py` and fill it in; `deploy.py` refuses
to run without it. The live URL is in that file.

Two things ship. nginx serves `dist/` through an `alias` block, and proxies
`/NickOnline/api/` to **gunicorn on `127.0.0.1:8008`** under the systemd unit
`nickonline-api`. Both location blocks are spliced into a shared catch-all vhost before
`NGINX_ANCHOR`, so they reuse that vhost's TLS cert. The port is a public constant in
`deploy.py`, not in `deploy_local.py`, because `vite.config.ts` needs it too and cannot
import a gitignored file.

On the box:

```
/home/ubuntu/nickonline/
├── dist/     rsync --delete target   (frontend)
├── server/   rsync --delete target   (API; venv/ and tests/ excluded)
└── data/     NEVER an rsync target · chmod 700
    ├── nickonline.sqlite3(-wal/-shm)
    └── secret_key                     (0600)
```

`data/` is a **sibling** of both rsync targets, so `--delete` is structurally incapable of
reaching it — no `--filter 'protect'` rule to remember or accidentally drop. The deploy
makes only `dist/` world-readable; a recursive `chmod o+rX` over the project dir would
publish the database and every password hash to the other apps on the box.

`deploy.py` refuses to deploy if either suite fails, and after deploying it asserts that
`/api/health` is 200 **and that `/api/library` is 401** — an unauthenticated 200 there
would mean the login gate is not in the request path at all, so that one **fails the
deploy** rather than warning. It finishes by committing and pushing to GitHub, so what is
published always matches what is live.

First deploy only: sign up in the app, then promote yourself.

```bash
ssh <user>@<host> "cd /home/ubuntu/nickonline/server && \
  NICKONLINE_DATA_DIR=/home/ubuntu/nickonline/data \
  venv/bin/python -m cli promote <username>"
```

Needs passwordless sudo on the box for `nginx -t`, `systemctl reload nginx` and
`systemctl restart nickonline-api`.
