/**
 * Application state: the match input, the correction flags, sharing and the
 * saved library.
 *
 * The calculator half is entirely local and synchronous — `input`,
 * `corrections` and everything that edits them never touches the network, so an
 * anonymous visitor gets the whole model with no account.
 *
 * The library half (`saved`, `lineups`) belongs to a *group* on the server. It
 * starts empty and is filled by `loadLibrary()` after sign-in. It used to
 * hydrate from localStorage at module scope, which cannot work now: the request
 * has to wait for a session, and the answer depends on which group you are in.
 */

import { create } from 'zustand'
import { api, ApiError } from '../api/client'
import example from '../data/example.json'
import { markImported, readLegacy } from '../migrate/localLibrary'
import type { Corrections, MatchInput, SpecialtyGrid, TeamInput, Line, Specialty, Tactic, Location } from '../engine/types'
import { NO_CORRECTIONS } from '../engine/types'

const line = (cells: (string | null)[]): Line => cells.map((c) => (c ?? '') as Specialty) as unknown as Line

/** The workbook's saved state, for the "Load v5.1 example" button. */
export const exampleInput = (): MatchInput => {
  const team = (t: (typeof example)['teamA'], name: string): TeamInput => ({
    name,
    possession: t.possession ?? 0.5,
    percentConv: t.percentConv as [number, number, number],
    att: t.att as [number, number, number],
    mid: t.mid,
    def: t.def as [number, number, number],
    ispDef: t.ispDef,
    ispAtt: t.ispAtt,
    gkStars: t.gkStars,
    tactic: t.tactic as Tactic,
    tacticLevel: t.tacticLevel ?? 0,
    specialties: {
      fw: line(t.specialties.fw),
      mid: line(t.specialties.mid),
      def: line(t.specialties.def),
      gk: line(t.specialties.gk),
    },
    location: t.location as Location,
  })
  return {
    ratingsMode: example.ratingsMode as 'Ratings' | 'Percent',
    specialtiesMode: example.specialtiesMode as 'Yes' | 'No',
    extraTime: example.extraTime as 'N' | 'Y',
    manmarking: example.manmarking as 0 | 1 | 2,
    teamA: team(example.teamA, 'Team A'),
    teamB: team(example.teamB as unknown as (typeof example)['teamA'], 'Team B'),
  }
}

const blankTeam = (name: string, location: Location): TeamInput => ({
  name,
  possession: 0.5,
  percentConv: [0.25, 0.25, 0.25],
  att: [12, 12, 12],
  mid: 12,
  def: [12, 12, 12],
  ispDef: 10,
  ispAtt: 10,
  gkStars: 8,
  tactic: '(no tactic)',
  tacticLevel: 0,
  specialties: withDefaultLines(),
  location,
})

/**
 * A default 4-5-1-ish shape. Slots hold 'Z' (no specialty) rather than blank
 * because COUNTA only sees a player in a non-empty cell — a blank winger would
 * silently suppress the winger special events.
 */
const withDefaultLines = (): SpecialtyGrid => ({
  fw: ['', 'Z', 'Z', 'Z', ''],
  mid: ['Z', 'Z', 'Z', 'Z', 'Z'],
  def: ['Z', 'Z', 'Z', 'Z', ''],
  gk: ['', '', 'Z', '', ''],
})

export const defaultInput = (): MatchInput => ({
  ratingsMode: 'Ratings',
  specialtiesMode: 'Yes',
  extraTime: 'N',
  manmarking: 0,
  teamA: blankTeam('Team A', 'Home'),
  teamB: blankTeam('Team B', 'Away'),
})

export interface SavedMatchup {
  /** Server id. Names identify a matchup to people; this identifies it to the API. */
  id: string
  name: string
  savedAt: number
  /** Who saved it last — a byline on a shared shelf, not a permission. */
  savedBy: string
  input: MatchInput
  corrections: Corrections
}

/**
 * One team's setup on its own, so a side's options can be swept against the
 * other's. Match-level settings (input mode, cup rules) stay with the match.
 */
export interface SavedLineup {
  id: string
  name: string
  side: 'A' | 'B'
  savedAt: number
  savedBy: string
  team: TeamInput
}

/** What a write returned: saved, or refused because the name is already taken. */
export type SaveResult = 'ok' | 'conflict' | 'error'

/** Who holds the name a save collided with, so the user can decide knowingly. */
export interface Conflict {
  name: string
  savedBy: string
  savedAt: number
}

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface State {
  input: MatchInput
  corrections: Corrections
  saved: SavedMatchup[]
  lineups: SavedLineup[]
  compareWith: string | null
  /** Fields an import could not supply, highlighted until the user fills them. */
  needsAttention: string[]
  library: LibraryStatus
  libraryError: string | null
  /** Set when the last save hit a name someone else already used. */
  conflict: Conflict | null

  // Local and synchronous: the calculator works with no account and no network.
  setInput: (fn: (draft: MatchInput) => void) => void
  replaceInput: (input: MatchInput, corrections?: Corrections) => void
  setCorrection: (key: keyof Corrections, value: boolean) => void
  setCompareWith: (name: string | null) => void
  applyImport: (found: Partial<TeamInput>, attention: string[]) => void
  clearAttention: (field: string) => void
  applyLineup: (lineup: SavedLineup) => void
  applyPairing: (a: SavedLineup, b: SavedLineup) => void

  // The group's shared library, on the server.
  loadLibrary: () => Promise<void>
  clearLibrary: () => void
  save: (name: string, overwrite?: boolean) => Promise<SaveResult>
  remove: (name: string) => Promise<void>
  saveLineup: (side: 'A' | 'B', name: string, overwrite?: boolean) => Promise<SaveResult>
  removeLineup: (id: string) => Promise<void>
  clearConflict: () => void
  importLocal: () => Promise<{ added: number; skipped: string[] }>
  importPersonal: () => Promise<{ added: number; skipped: string[] }>
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const byNewest = (a: { savedAt: number }, b: { savedAt: number }) => b.savedAt - a.savedAt

/** Replace the row with the same id, or add it, then re-sort. */
function splice<T extends { id: string; savedAt: number }>(rows: T[], row: T): T[] {
  return [...rows.filter((r) => r.id !== row.id), row].sort(byNewest)
}

export const useStore = create<State>((set, get) => ({
  input: defaultInput(),
  corrections: { ...NO_CORRECTIONS },
  saved: [],
  lineups: [],
  compareWith: null,
  needsAttention: [],
  library: 'idle',
  libraryError: null,
  conflict: null,

  setInput: (fn) =>
    set((s) => {
      const draft = clone(s.input)
      fn(draft)
      return { input: draft }
    }),

  replaceInput: (input, corrections) =>
    set(() => ({
      input: clone(input),
      ...(corrections ? { corrections: { ...corrections } } : {}),
    })),

  setCorrection: (key, value) =>
    set((s) => ({ corrections: { ...s.corrections, [key]: value } })),

  /**
   * Merge a Hattrick paste into Team A. Only the keys the paste actually
   * contained are written, so set pieces, keeper stars and ground survive.
   */
  applyImport: (found, attention) =>
    set((s) => {
      const input = clone(s.input)
      input.teamA = { ...input.teamA, ...clone(found) }
      return { input, needsAttention: attention }
    }),

  clearAttention: (field) =>
    set((s) => ({ needsAttention: s.needsAttention.filter((f) => f !== field) })),

  setCompareWith: (name) => set({ compareWith: name }),

  /**
   * One round-trip for the whole shelf. The scenario table simulates every
   * matchup and the matrix simulates every pairing, so the client needs the
   * full payloads rather than a summary it would have to fetch row by row.
   */
  loadLibrary: async () => {
    set({ library: 'loading', libraryError: null })
    try {
      const data = await api<{ matchups: SavedMatchup[]; lineups: SavedLineup[] }>('/library')
      set({
        saved: [...data.matchups].sort(byNewest),
        lineups: [...data.lineups].sort(byNewest),
        library: 'ready',
      })
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not load your library.'
      // A 401 is not an error worth shouting about: the session simply ended,
      // and App.tsx has already been told to fall back to the signed-out view.
      if (e instanceof ApiError && e.status === 401) set({ library: 'idle' })
      else set({ library: 'error', libraryError: message })
    }
  },

  clearLibrary: () =>
    set({ saved: [], lineups: [], library: 'idle', libraryError: null, compareWith: null }),

  clearConflict: () => set({ conflict: null }),

  save: async (name, overwrite = false) => {
    const { input, corrections } = get()
    try {
      const row = await api<SavedMatchup>('/matchups', {
        method: 'PUT',
        body: { name, input, corrections, overwrite },
      })
      set((s) => ({ saved: splice(s.saved, row), conflict: null }))
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        set({ conflict: e.detail as Conflict })
        return 'conflict'
      }
      set({ libraryError: e instanceof ApiError ? e.message : 'Could not save.' })
      return 'error'
    }
  },

  remove: async (name) => {
    // The table and its callers speak in names; the API speaks in ids.
    const row = get().saved.find((m) => m.name === name)
    if (!row) return
    try {
      await api(`/matchups/${row.id}`, { method: 'DELETE' })
      set((s) => ({
        saved: s.saved.filter((m) => m.id !== row.id),
        compareWith: s.compareWith === name ? null : s.compareWith,
      }))
    } catch (e) {
      set({ libraryError: e instanceof ApiError ? e.message : 'Could not delete.' })
    }
  },

  saveLineup: async (side, name, overwrite = false) => {
    const team = side === 'A' ? get().input.teamA : get().input.teamB
    try {
      const row = await api<SavedLineup>('/lineups', {
        method: 'POST',
        body: { side, name, team, overwrite },
      })
      set((s) => ({ lineups: splice(s.lineups, row), conflict: null }))
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        set({ conflict: e.detail as Conflict })
        return 'conflict'
      }
      set({ libraryError: e instanceof ApiError ? e.message : 'Could not save.' })
      return 'error'
    }
  },

  removeLineup: async (id) => {
    try {
      await api(`/lineups/${id}`, { method: 'DELETE' })
      set((s) => ({ lineups: s.lineups.filter((l) => l.id !== id) }))
    } catch (e) {
      set({ libraryError: e instanceof ApiError ? e.message : 'Could not delete.' })
    }
  },

  /** Upload what this browser saved before accounts existed. User-initiated. */
  importLocal: async () => {
    const legacy = readLegacy()
    const result = await api<{ added: number; skipped: string[] }>('/import/local', {
      method: 'POST',
      body: legacy,
    })
    markImported()
    await get().loadLibrary()
    return result
  },

  /** Copy the personal shelf into the shared group. Copies, never moves. */
  importPersonal: async () => {
    const result = await api<{ added: number; skipped: string[] }>('/personal/import', {
      method: 'POST',
    })
    await get().loadLibrary()
    return result
  },

  applyLineup: (lineup) =>
    set((s) => {
      const input = clone(s.input)
      if (lineup.side === 'A') input.teamA = clone(lineup.team)
      else input.teamB = clone(lineup.team)
      return { input }
    }),

  applyPairing: (a, b) =>
    set((s) => {
      const input = clone(s.input)
      input.teamA = clone(a.team)
      input.teamB = clone(b.team)
      return { input }
    }),
}))

/** Build the matchup that a given pairing would produce, without mutating state. */
export function pairingInput(base: MatchInput, a: TeamInput, b: TeamInput): MatchInput {
  return { ...base, teamA: a, teamB: b }
}
