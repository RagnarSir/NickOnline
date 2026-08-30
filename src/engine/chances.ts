/** Chance generation: the funnel and the sector table (simulator T2:AG22). */

import { approx, approxIndex, bucketIndex, exact, type Diagnostics } from './lookup'
import { K, T } from './tables'
import type { SectorRow } from './types'

/** The set-piece matrices are keyed on own ISP Attack against opposing ISP Defence. */
export function setPieceRates(ownIspAtt: number, oppIspDef: number) {
  const r = approxIndex(T.dfkPk.attKeys, ownIspAtt)
  const c = bucketIndex(T.dfkPk.defBreakpoints, oppIspDef)
  return {
    pkConv: T.dfkPk.pk[r][c],
    dfkConv: T.dfkPk.dfk[r][c],
    /** Share of set-piece events that are penalties rather than free kicks. */
    pkShare: T.dfkPk.pkShare[r][c],
  }
}

export interface ChanceInput {
  who: string
  /** X3 / AD3 — chances left after pressing, possession and the opponent's PDIM. */
  chancesAfterPdim: number
  counterAttacks: number
  sectorConv: [number, number, number]
  ownIspAtt: number
  oppIspDef: number
  lsLevel: number
  aimLevel: number
  aowLevel: number
  /** X4 / AD4 — the fraction of long shots the opponent's pressing removes. */
  pressLsPct: number
  /** Team A gates the long-shot share on the tactic name, Team B on the level. */
  lsGate: 'tactic' | 'level'
  playsLongShots: boolean
  tacticLevel: number
}

export interface ChanceResult {
  sectors: SectorRow[]
  totalChances: number
  totalGoals: number
  missedNormal: number
  aimShift: number
  aowShift: number
  lsPct: number
  pkShare: number
}

const LABELS = ['Left', 'Center', 'Right', 'Direct free kick', 'Penalty', 'Indirect free kick', 'Long shot']

export function chanceTable(inp: ChanceInput, diag: Diagnostics): ChanceResult {
  const { who } = inp

  const aimShift =
    inp.aimLevel === 0 ? 0 : approx(T.approx.aimShift, inp.aimLevel, `${who}.aimShift`, diag)
  const aowShift =
    inp.aowLevel === 0 ? 0 : approx(T.approx.aowShift, inp.aowLevel, `${who}.aowShift`, diag)

  // Share of chances that arrive as long shots.
  const playingLs = inp.lsGate === 'tactic' ? inp.playsLongShots : inp.lsLevel !== 0
  let lsPct = 0.006
  if (playingLs) {
    const keyLevel = inp.lsGate === 'tactic' ? inp.tacticLevel : inp.lsLevel
    const e = T.exact.lsDist[String(keyLevel)]
    if (e === undefined) {
      diag.error(`${who}.lsDist`, `No long-shot distribution for tactic level ${keyLevel}.`)
    } else {
      lsPct = e.tactic + e.nonTactic
    }
  }

  const { pkConv, dfkConv, pkShare } = setPieceRates(inp.ownIspAtt, inp.oppIspDef)
  const ifkConv = approx(
    T.approx.ifkConv,
    inp.ownIspAtt * 4 - inp.oppIspDef * 4,
    `${who}.ifkConv`,
    diag,
  )
  const lsConv = approx(T.approx.lsConv, inp.lsLevel, `${who}.lsConv`, diag)

  const rest = 1 - lsPct
  const dLeft = rest * (K.distLeft * (1 - aimShift) + (aowShift / 2) * K.distCenter)
  const dCenter = rest * (K.distCenter * (1 - aowShift) + aimShift * K.distLeft * 2)

  const dist = [
    dLeft,
    dCenter,
    dLeft, // W9 = W7
    rest * K.distSetPiece * (1 - pkShare),
    rest * K.distSetPiece * pkShare,
    rest * K.distIfk,
    lsPct,
  ]
  const conv = [
    inp.sectorConv[0],
    inp.sectorConv[1],
    inp.sectorConv[2],
    dfkConv,
    pkConv,
    ifkConv,
    lsConv,
  ]

  // Counter-attacks use the raw distribution: no AIM/AOW shift, and no long shots.
  const caDist = [
    K.distLeft,
    K.distCenter,
    K.distRight,
    K.distSetPiece * (1 - pkShare),
    K.distSetPiece * pkShare,
    K.distIfk,
    0,
  ]

  const sectors: SectorRow[] = LABELS.map((label, i) => {
    const isLs = i === 6
    const chances = isLs
      ? inp.chancesAfterPdim * dist[i] * (1 - inp.pressLsPct)
      : inp.chancesAfterPdim * dist[i]
    const caChances = inp.counterAttacks * caDist[i]
    return {
      label,
      conv: conv[i],
      dist: dist[i],
      chances,
      goals: chances * conv[i],
      caChances,
      caGoals: caChances * conv[i],
    }
  })

  const totalChances = sectors.reduce((s, r) => s + r.chances, 0)
  const totalGoals = sectors.reduce((s, r) => s + r.goals, 0)

  return {
    sectors,
    totalChances,
    totalGoals,
    missedNormal: totalChances - totalGoals,
    aimShift,
    aowShift,
    lsPct,
    pkShare,
  }
}

/** U3 — pressing removes normal chances from the match as a whole. */
export function chancesAfterPressing(pressA: number, pressB: number, diag: Diagnostics): number {
  return (
    K.baseNormalChances -
    exact(T.exact.pressingChancesRemoved, pressA, 'teamA.pressing', diag) -
    exact(T.exact.pressingChancesRemoved, pressB, 'teamB.pressing', diag)
  )
}

/** X4 — how much of a team's long-shot output the opponent's pressing removes. */
export function pressLsPct(
  ownLsLevel: number,
  oppPressLevel: number,
  diag: Diagnostics,
  who: string,
): number {
  return (
    approx(T.approx.lsPressed, ownLsLevel, `${who}.lsPressed`, diag) *
    approx(T.approx.pressAdj, oppPressLevel, `${who}.pressAdj`, diag)
  )
}
