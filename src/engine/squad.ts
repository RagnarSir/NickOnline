/**
 * Specialty-grid counting, matching the workbook's COUNTIF / COUNTA ranges.
 *
 * The grid is four lines (FW, MID, DEF, GK) of five lateral positions, which are
 * the workbook's columns I, J, K, L, M on rows 11-14 (Team A) and 17-20 (Team B).
 */

import type { Specialty, SpecialtyGrid, Line } from './types'

export const EMPTY_LINE: Line = ['', '', '', '', '']

export const emptyGrid = (): SpecialtyGrid => ({
  fw: [...EMPTY_LINE] as Line,
  mid: [...EMPTY_LINE] as Line,
  def: [...EMPTY_LINE] as Line,
  gk: [...EMPTY_LINE] as Line,
})

const cells = (...lines: Specialty[][]): Specialty[] => lines.flat()

/** COUNTIF over a set of cells. */
export const countIf = (list: Specialty[], want: Specialty): number =>
  list.filter((s) => s === want).length

/** COUNTA — non-empty cells. 'Z' counts; a blank cell does not. */
export const countA = (list: Specialty[]): number => list.filter((s) => s !== '').length

/** Head specialists, counting set-piece takers too. */
export const countHead = (list: Specialty[]): number => countIf(list, 'H') + countIf(list, 'H+SP')

/** Named ranges over one team's grid. */
export const ranges = (g: SpecialtyGrid) => ({
  /** I11:M12 — forwards and midfield. */
  offensive: cells(g.fw, g.mid),
  /** I11:M13 — everyone but the keeper. */
  outfield: cells(g.fw, g.mid, g.def),
  /** I11:M14 — the whole team. */
  all: cells(g.fw, g.mid, g.def, g.gk),
  /** I13:M14 — defence and keeper. */
  defAndKeeper: cells(g.def, g.gk),
  /** I12:M14 — midfield, defence and keeper. */
  midDefKeeper: cells(g.mid, g.def, g.gk),
  /** I13:M13 — the defensive line. */
  defLine: g.def as Specialty[],
  /** I11:M11 — the whole forward line. */
  fwLine: g.fw as Specialty[],
  /** J12:L12 — inner midfield. */
  innerMid: g.mid.slice(1, 4),
  /** J11:L11 — the three forwards. */
  forwards: g.fw.slice(1, 4),
  /** J13:L13 — central defenders. */
  centralDefenders: g.def.slice(1, 4),
  /** I12 and M12 — the wingers. */
  wingers: [g.mid[0], g.mid[4]],
})

/**
 * Where an attacker in lateral slot `i` meets the opposing defensive line.
 *
 * Midfielders mirror straight across (0<->4, 1<->3). The three forwards occupy
 * slots 1-3 but spread across the full width, meeting defenders 4, 2 and 0.
 */
export const mirrorForForward = (i: number): number => 6 - 2 * i
export const mirrorForMidfielder = (i: number): number => 4 - i

export const adjacent = (i: number): number[] => [i - 1, i + 1].filter((j) => j >= 0 && j <= 4)
