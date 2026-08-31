/**
 * What earlier versions of NickOnline left in this browser.
 *
 * Saved work used to live in localStorage. It now lives on the server, scoped
 * to a group — so the old keys are a one-time import source, offered to the
 * user rather than uploaded on their behalf. They are never deleted: if an
 * import goes wrong, the data is still here.
 */

import type { Corrections, MatchInput, TeamInput } from '../engine/types'

const SAVED_KEY = 'nickonline-saved-v1'
const LINEUP_KEY = 'nickonline-lineups-v1'
const MARK_KEY = 'nickonline-migrated-v1'

export interface LegacyMatchup {
  name: string
  savedAt: number
  input: MatchInput
  corrections: Corrections
}

export interface LegacyLineup {
  id: string
  name: string
  side: 'A' | 'B'
  savedAt: number
  team: TeamInput
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    // Private browsing, blocked storage, or corrupt JSON — there is simply
    // nothing to offer, which is not an error worth showing anyone.
    return []
  }
}

export function readLegacy() {
  return {
    matchups: read<LegacyMatchup>(SAVED_KEY),
    lineups: read<LegacyLineup>(LINEUP_KEY),
  }
}

export function legacyCounts() {
  const { matchups, lineups } = readLegacy()
  return { matchups: matchups.length, lineups: lineups.length }
}

export function wasImported(): boolean {
  try {
    return localStorage.getItem(MARK_KEY) !== null
  } catch {
    return false
  }
}

export function markImported() {
  try {
    localStorage.setItem(MARK_KEY, String(Date.now()))
  } catch {
    /* nothing to do; the server-side local_import_at is the durable marker */
  }
}
