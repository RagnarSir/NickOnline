-- NickOnline accounts and group-scoped libraries.
--
-- Every row a user can read or write carries a group_id, and that column is the
-- only isolation mechanism in the system. It is set at write time from the
-- session and is never accepted from a request. See server/library.py.
--
-- Timestamps are epoch MILLISECONDS throughout, matching the client's existing
-- Date.now() in SavedMatchup.savedAt, so nothing ever converts units.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY,
  public_id   TEXT    NOT NULL UNIQUE,        -- opaque; rowids are never exposed
  name        TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('personal','shared')),
  -- A join code is the whole membership gate: signup is open, so holding the
  -- code is what proves you are the teammate the admin meant. NULL = closed.
  join_code   TEXT    UNIQUE,
  join_uses   INTEGER NOT NULL DEFAULT 0,
  join_max    INTEGER,                        -- NULL = unlimited
  created_at  INTEGER NOT NULL
);

-- Shared group names are unique so a join code can be described by name without
-- ambiguity. Personal group names track usernames, which are unique anyway.
CREATE UNIQUE INDEX IF NOT EXISTS groups_shared_name
  ON groups(name COLLATE NOCASE) WHERE kind = 'shared';

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY,
  public_id         TEXT    NOT NULL UNIQUE,
  username          TEXT    NOT NULL,         -- stored lowercased
  password_hash     TEXT    NOT NULL,
  role              TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  -- The group the user acts in now, and the solo group made at signup. The
  -- second never changes, so leaving a shared group is always possible.
  group_id          INTEGER NOT NULL REFERENCES groups(id),
  personal_group_id INTEGER NOT NULL REFERENCES groups(id),
  disabled          INTEGER NOT NULL DEFAULT 0,
  -- Bumped on every password change, and carried in the session cookie, so a
  -- password change invalidates sessions everywhere with no session table.
  pw_version        INTEGER NOT NULL DEFAULT 1,
  local_import_at   INTEGER,                  -- one-time localStorage import
  created_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username);
CREATE INDEX IF NOT EXISTS users_group ON users(group_id);

CREATE TABLE IF NOT EXISTS matchups (
  id         INTEGER PRIMARY KEY,
  public_id  TEXT    NOT NULL UNIQUE,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  saved_at   INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payload    TEXT    NOT NULL                 -- JSON {input, corrections}
);
-- Mirrors the client's existing dedupe-by-name, now scoped to a group.
CREATE UNIQUE INDEX IF NOT EXISTS matchups_group_name
  ON matchups(group_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS matchups_group_saved ON matchups(group_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS lineups (
  id         INTEGER PRIMARY KEY,
  public_id  TEXT    NOT NULL UNIQUE,         -- becomes SavedLineup.id on the client
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  side       TEXT    NOT NULL CHECK (side IN ('A','B')),
  name       TEXT    NOT NULL,
  saved_at   INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  team       TEXT    NOT NULL                 -- JSON TeamInput
);
-- Mirrors the client's existing dedupe by (side, name).
CREATE UNIQUE INDEX IF NOT EXISTS lineups_group_side_name
  ON lineups(group_id, side, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS lineups_group ON lineups(group_id, side, saved_at DESC);

CREATE TABLE IF NOT EXISTS login_events (
  id         INTEGER PRIMARY KEY,
  ts         INTEGER NOT NULL,
  username   TEXT,
  user_id    INTEGER,
  event      TEXT    NOT NULL,   -- success | failed | signup | join | lockout
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS login_events_ts ON login_events(ts DESC);

CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
