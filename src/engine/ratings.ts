/** Ratings -> levels -> possession and sector conversion (simulator C11:F12, W25:AE27). */

import { K } from './tables'
import type { MatchInput, TeamInput } from './types'

/** HT rating decimal -> integer level. 1.00 -> 1, 1.25 -> 2, 5.00 -> 17. */
export const level = (rating: number): number => rating * 4 - 3

export interface Levels {
  att: [number, number, number]
  mid: number
  def: [number, number, number]
}

export const levels = (t: TeamInput): Levels => ({
  att: [level(t.att[0]), level(t.att[1]), level(t.att[2])],
  mid: level(t.mid),
  def: [level(t.def[0]), level(t.def[1]), level(t.def[2])],
})

/** C11 — cubic on midfield levels. */
export const ratingsPossession = (a: Levels, b: Levels): number =>
  a.mid ** 3 / (a.mid ** 3 + b.mid ** 3)

/**
 * D11:F11 — own attack against the *mirrored* opposing defence, capped at 0.92.
 * Attack Left meets the opponent's Defence Right.
 */
export const ratingsSectorConv = (a: Levels, b: Levels): [number, number, number] => {
  const f = (att: number, def: number) =>
    (att ** 3.5 / (att ** 3.5 + def ** 3.5)) * K.sectorConvCap
  return [f(a.att[0], b.def[2]), f(a.att[1], b.def[1]), f(a.att[2], b.def[0])]
}

/** V7:V9 / AB7:AB9 — the conversion rates actually used, per input mode. */
export const sectorConv = (
  input: MatchInput,
  team: TeamInput,
  own: Levels,
  opp: Levels,
): [number, number, number] =>
  input.ratingsMode === 'Percent' ? [...team.percentConv] : ratingsSectorConv(own, opp)
