/** Application state: the match input, the correction flags, sharing and saved matchups. */

import { create } from 'zustand'
import example from '../data/example.json'
import type { Corrections, MatchInput, SpecialtyGrid, TeamInput, Line, Specialty, Tactic, Location } from '../engine/types'
import { NO_CORRECTIONS } from '../engine/types'

const SAVED_KEY = 'nickonline-saved-v1'
const LINEUP_KEY = 'nickonline-lineups-v1'

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
  name: string
  savedAt: number
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
  team: TeamInput
}

interface State {
  input: MatchInput
  corrections: Corrections
  saved: SavedMatchup[]
  lineups: SavedLineup[]
  compareWith: string | null
  /** Fields an import could not supply, highlighted until the user fills them. */
  needsAttention: string[]
  setInput: (fn: (draft: MatchInput) => void) => void
  replaceInput: (input: MatchInput, corrections?: Corrections) => void
  setCorrection: (key: keyof Corrections, value: boolean) => void
  save: (name: string) => void
  remove: (name: string) => void
  setCompareWith: (name: string | null) => void
  applyImport: (found: Partial<TeamInput>, attention: string[]) => void
  clearAttention: (field: string) => void
  saveLineup: (side: 'A' | 'B', name: string) => void
  removeLineup: (id: string) => void
  applyLineup: (lineup: SavedLineup) => void
  applyPairing: (a: SavedLineup, b: SavedLineup) => void
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private browsing, quota, blocked storage — the app still works */
  }
}

export const useStore = create<State>((set, get) => ({
  input: defaultInput(),
  corrections: { ...NO_CORRECTIONS },
  saved: read<SavedMatchup>(SAVED_KEY),
  lineups: read<SavedLineup>(LINEUP_KEY),
  compareWith: null,
  needsAttention: [],

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

  save: (name) => {
    const { input, corrections, saved } = get()
    const next = [
      ...saved.filter((m) => m.name !== name),
      { name, savedAt: Date.now(), input: clone(input), corrections: { ...corrections } },
    ].sort((a, b) => b.savedAt - a.savedAt)
    write(SAVED_KEY, next)
    set({ saved: next })
  },

  remove: (name) => {
    const next = get().saved.filter((m) => m.name !== name)
    write(SAVED_KEY, next)
    set({ saved: next, compareWith: get().compareWith === name ? null : get().compareWith })
  },

  setCompareWith: (name) => set({ compareWith: name }),

  saveLineup: (side, name) => {
    const team = side === 'A' ? get().input.teamA : get().input.teamB
    const next = [
      ...get().lineups.filter((l) => !(l.side === side && l.name === name)),
      { id: `${side}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, side, savedAt: Date.now(), team: clone(team) },
    ]
    write(LINEUP_KEY, next)
    set({ lineups: next })
  },

  removeLineup: (id) => {
    const next = get().lineups.filter((l) => l.id !== id)
    write(LINEUP_KEY, next)
    set({ lineups: next })
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
