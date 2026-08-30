/** HTS and HTSN (simulator BA4:BH13 and D23:F28). */

import { exact, exactStr, type Diagnostics } from './lookup'
import { T } from './tables'
import type { Corrections, TeamInput } from './types'

/** BE12/BF12 — the weights that fold Left/Center/Right attack into one number. */
export function attackWeights(
  aimLevel: number,
  aowLevel: number,
  corrections: Corrections,
): { side: number; middle: number } {
  const normal = T.htsWeights['x']
  const aim = T.htsWeights['AIM']
  const aow = T.htsWeights['AOW']
  if (aimLevel > 0) {
    // v5.1 returns AIM's *side* weight for the middle slot; weights then sum to 0.75.
    return { side: aim.side, middle: corrections.aimCentreWeight ? aim.middle : aim.side }
  }
  if (aowLevel > 0) return { side: aow.side, middle: aow.middle }
  return { side: normal.side, middle: normal.middle }
}

export interface HtsInput {
  team: TeamInput
  caLevel: number
  lsLevel: number
  /** Own midfield rating over the opponent's — drives the "extreme CA" table. */
  midRatio: number
  attWeights: { side: number; middle: number }
}

export interface HtsResult {
  hts: number
  parts: { att: number; mid: number; def: number; ls: number }
  aggregates: { att: number; def: number; tacticCode: number; midTacticCode: number }
}

const DEF_WEIGHTS = { side: 0.3, middle: 0.4 } // BE13 / BF13, hard-typed in the sheet

export function computeHts(inp: HtsInput, diag: Diagnostics, who: string): HtsResult {
  const { team, caLevel, lsLevel, midRatio, attWeights: w } = inp

  const att = w.side * team.att[0] + w.middle * team.att[1] + w.side * team.att[2]
  const def =
    DEF_WEIGHTS.side * team.def[0] + DEF_WEIGHTS.middle * team.def[1] + DEF_WEIGHTS.side * team.def[2]

  // 8 = Long Shots, 2 = Counter Attacks, 9 = neither. 3 = counter-attacking from
  // a midfield deficit, which gets its own midfield table.
  const tacticCode = lsLevel > 0 ? 8 : caLevel > 0 ? 2 : 9
  const midTacticCode = tacticCode === 2 && midRatio < 0.5 ? 3 : tacticCode

  const key = (code: number, rating: number) => code * 1000 + Math.floor(rating * 4 - 3)

  const partAtt = exact(T.exact.htsAtt, key(tacticCode, att), `${who}.hts.att`, diag, 1)
  const partMid = exact(T.exact.htsMid, key(midTacticCode, team.mid), `${who}.hts.mid`, diag, 1)
  const partDef = exact(T.exact.htsDef, key(tacticCode, def), `${who}.hts.def`, diag, 1)
  const partLs =
    lsLevel === 0 ? 1 : exact(T.exact.htsLs, 8000 + lsLevel, `${who}.hts.ls`, diag, 1)

  return {
    hts: 100 * partAtt * partMid * partDef * partLs,
    parts: { att: partAtt, mid: partMid, def: partDef, ls: partLs },
    aggregates: { att, def, tacticCode, midTacticCode },
  }
}

/**
 * E27/F27 — HTS adjusted to neutral conditions. Display only: nothing downstream
 * reads it, so home advantage does not move the win probabilities.
 */
export function computeHtsn(
  hts: number,
  location: string,
  extraTime: string,
  manmarking: number,
  diag: Diagnostics,
  who: string,
): number {
  const loc = exactStr(T.htsn.location, location, `${who}.htsn.location`, diag, 1)
  const et = exactStr(T.htsn.extraTime, extraTime, `${who}.htsn.extraTime`, diag, 1)
  const mm = exact(T.htsn.manmarking, manmarking, `${who}.htsn.manmarking`, diag, 1)
  return hts * loc * et * mm
}
