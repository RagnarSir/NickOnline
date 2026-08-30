/** Turns the workbook's saved state (tests/fixtures/golden.json) into a MatchInput. */

import golden from './fixtures/golden.json'
import type { Line, MatchInput, Specialty, SpecialtyGrid, TeamInput, Tactic, Location } from '../src/engine/types'

/** Written out rather than inferred: TypeScript narrows the JSON's nulls to `null`. */
interface RawTeam {
  possession: number | null
  percentConv: number[]
  att: number[]
  mid: number
  def: number[]
  ispDef: number
  ispAtt: number
  gkStars: number
  tactic: string
  tacticLevel: number | null
  specialties: { fw: (string | null)[]; mid: (string | null)[]; def: (string | null)[]; gk: (string | null)[] }
  location: string
}

const line = (cells: (string | null)[]): Line =>
  cells.map((c) => (c ?? '') as Specialty) as unknown as Line

const grid = (g: RawTeam['specialties']): SpecialtyGrid => ({
  fw: line(g.fw),
  mid: line(g.mid),
  def: line(g.def),
  gk: line(g.gk),
})

const team = (t: RawTeam, name: string): TeamInput => ({
  name,
  possession: t.possession ?? 0,
  percentConv: t.percentConv as [number, number, number],
  att: t.att as [number, number, number],
  mid: t.mid,
  def: t.def as [number, number, number],
  ispDef: t.ispDef,
  ispAtt: t.ispAtt,
  gkStars: t.gkStars,
  tactic: t.tactic as Tactic,
  tacticLevel: t.tacticLevel ?? 0,
  specialties: grid(t.specialties),
  location: t.location as Location,
})

export const goldenInput: MatchInput = {
  ratingsMode: golden.input.ratingsMode as 'Ratings' | 'Percent',
  specialtiesMode: golden.input.specialtiesMode as 'Yes' | 'No',
  extraTime: golden.input.extraTime as 'N' | 'Y',
  manmarking: golden.input.manmarking as 0 | 1 | 2,
  teamA: team(golden.input.teamA as RawTeam, 'Team A'),
  teamB: team(golden.input.teamB as RawTeam, 'Team B'),
}

/** The workbook's cached value for a cell, e.g. cell('P2'). */
export const cell = (ref: string): number => {
  const v = (golden.cells as Record<string, number | string>)[ref]
  if (typeof v !== 'number') throw new Error(`golden cell ${ref} is not a number: ${String(v)}`)
  return v
}
