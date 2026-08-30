/** Input and output types for the simulator engine. Mirrors the workbook's own vocabulary. */

export const TACTICS = [
  '(no tactic)',
  'Counter Attacks',
  'Long Shots',
  'Play Creatively',
  'Pressing',
  'Attack on Wings',
  'Attack in Middle',
] as const
export type Tactic = (typeof TACTICS)[number]

/** '' means an empty cell, which is distinct from 'Z' (no specialty) for COUNTA purposes. */
export const SPECIALTIES = ['', 'Z', 'Q', 'H', 'H+SP', 'U', 'T', 'PNF', 'PDIM'] as const
export type Specialty = (typeof SPECIALTIES)[number]

export const LOCATIONS = ['Home', 'Away', 'Home Derby', 'Away Derby', 'Neutral'] as const
export type Location = (typeof LOCATIONS)[number]

export type RatingsMode = 'Ratings' | 'Percent'
export type YesNo = 'Yes' | 'No'

/** Five lateral positions, left to right — the workbook's columns I, J, K, L, M. */
export type Line = [Specialty, Specialty, Specialty, Specialty, Specialty]

export interface SpecialtyGrid {
  fw: Line
  mid: Line
  def: Line
  gk: Line
}

export interface TeamInput {
  /** Display name. Never read by the model — it only labels the output. */
  name: string
  /** Percent mode: share of midfield possession (Team B's is derived as 1 - A's). */
  possession: number
  /** Percent mode: Left / Center / Right conversion rates. */
  percentConv: [number, number, number]
  /** Ratings mode: Attack Left / Center / Right. */
  att: [number, number, number]
  mid: number
  def: [number, number, number]
  ispDef: number
  ispAtt: number
  gkStars: number
  tactic: Tactic
  tacticLevel: number
  specialties: SpecialtyGrid
  location: Location
}

export interface MatchInput {
  ratingsMode: RatingsMode
  specialtiesMode: YesNo
  extraTime: 'N' | 'Y'
  manmarking: 0 | 1 | 2
  teamA: TeamInput
  teamB: TeamInput
}

/**
 * Deviations from v5.1. All default to false so the engine reproduces the
 * spreadsheet exactly; each is documented in the UI.
 */
export interface Corrections {
  /** P6/R6 point at empty cells, so "After PK" silently echoes the 90' result. */
  afterPk: boolean
  /** AF4 drops the U-specialist counter-attack term that Z4 has. */
  teamBCounterAttacks: boolean
  /** BC5 builds Team B's attack from Team A's tactic weights. */
  teamBHtsWeights: boolean
  /** BF12's AIM branch returns the side weight (0.25) for the middle. */
  aimCentreWeight: boolean
  /** Extend the v5.1 corner linearisation to the counter-attack possession gate. */
  percentLinearise: boolean
}

export const NO_CORRECTIONS: Corrections = {
  afterPk: false,
  teamBCounterAttacks: false,
  teamBHtsWeights: false,
  aimCentreWeight: false,
  percentLinearise: false,
}

export const ALL_CORRECTIONS: Corrections = {
  afterPk: true,
  teamBCounterAttacks: true,
  teamBHtsWeights: true,
  aimCentreWeight: true,
  percentLinearise: true,
}

/** A problem the spreadsheet would have surfaced as #N/A or #DIV/0!. */
export interface Diagnostic {
  severity: 'error' | 'warning'
  field: string
  message: string
}

export interface SectorRow {
  label: string
  conv: number
  dist: number
  chances: number
  goals: number
  caChances: number
  caGoals: number
}

export interface SeRow {
  event: string
  specialty: string
  countA: number
  countB: number
  share: number
  freqA: number
  freqB: number
  convA: number
  convB: number
  goalsA: number
  goalsB: number
}

export interface TeamResult {
  xg: number
  xp: number
  hts: number
  htsn: number
  htsParts: { att: number; mid: number; def: number; ls: number }
  possession: number
  chancesAfterPress: number
  chancesAfterPoss: number
  chancesAfterPdim: number
  pressLsPct: number
  caPct: number
  uCounterAttacks: number
  counterAttacks: number
  sectors: SectorRow[]
  pnfChances: number
  pnfGoals: number
  chances: { lcr: number; setPiece: number; ls: number; ca: number; pnf: number; se: number; total: number }
  goals: { lcr: number; setPiece: number; ls: number; ca: number; pnf: number; se: number; total: number }
  goalDist: number[]
  tacticLevels: Record<string, number>
}

export interface MatchResult {
  teamA: TeamResult
  teamB: TeamResult
  se: SeRow[]
  regulation: { winA: number; draw: number; winB: number }
  afterExtraTime: { winA: number; draw: number; winB: number }
  afterPenalties: { winA: number; winB: number }
  shootout: { winA: number; winB: number }
  /** P(A scores i and B scores j) for i, j in 0..10. */
  scoreline: number[][]
  pcFactor: number
  diagnostics: Diagnostic[]
}
