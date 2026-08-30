/** Goal distribution and match outcomes (simulator P26:U38 and P2:R6). */

import { approx, type Diagnostics } from './lookup'
import { T } from './tables'
import type { Corrections } from './types'

export const MAX_GOALS = 10

/** POISSON(k, mean, FALSE). */
export function poissonPmf(k: number, mean: number): number {
  if (mean <= 0) return k === 0 ? 1 : 0
  let logp = -mean + k * Math.log(mean)
  for (let i = 2; i <= k; i++) logp -= Math.log(i)
  return Math.exp(logp)
}

/** POISSON(k, mean, TRUE). */
export function poissonCdf(k: number, mean: number): number {
  let s = 0
  for (let i = 0; i <= k; i++) s += poissonPmf(i, mean)
  return s
}

/**
 * P(team scores exactly k) for k = 0..9, with index 10 holding P(>= 10).
 * The tail keeps the distribution summing to 1.
 */
export function goalDistribution(xg: number): number[] {
  const d: number[] = []
  for (let k = 0; k < MAX_GOALS; k++) d.push(poissonPmf(k, xg))
  d.push(1 - poissonCdf(MAX_GOALS - 1, xg))
  return d
}

export interface OutcomeResult {
  regulation: { winA: number; draw: number; winB: number }
  afterExtraTime: { winA: number; draw: number; winB: number }
  afterPenalties: { winA: number; winB: number }
  shootout: { winA: number; winB: number }
  scoreline: number[][]
}

export function outcomes(
  distA: number[],
  distB: number[],
  xgA: number,
  xgB: number,
  ispAttA: number,
  ispAttB: number,
  corrections: Corrections,
  diag: Diagnostics,
): OutcomeResult {
  // S/T/U columns: for each scoreline for A, split by whether B scored fewer,
  // the same, or more.
  let winA = 0
  let draw = 0
  let winB = 0
  let cumB = 0 // P(B scores strictly fewer than k)
  for (let k = 0; k <= MAX_GOALS; k++) {
    const pA = distA[k]
    winA += cumB * pA
    draw += distB[k] * pA
    winB += pA - cumB * pA - distB[k] * pA
    cumB += distB[k]
  }

  const scoreline: number[][] = []
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row: number[] = []
    for (let j = 0; j <= MAX_GOALS; j++) row.push(distA[i] * distB[j])
    scoreline.push(row)
  }

  // Relative strength in regulation, used to split the draws that get resolved.
  const strengthA = winA / (winA + winB)
  const strengthB = 1 - strengthA

  const drawEt =
    approx(T.approx.drawEtByAvgXg, (xgA + xgB) / 2, 'et.avgXg', diag) *
    approx(T.approx.drawEtByGap, Math.abs(xgA - xgB), 'et.gap', diag) *
    draw

  const etWinA = winA + (draw - drawEt) * strengthA
  const etWinB = winB + (draw - drawEt) * strengthB

  // Penalty shootout, from the gap in set-piece attack.
  const pkCurve = approx(T.approx.pkShootout, Math.abs(ispAttA - ispAttB) * 4, 'pk.gap', diag)
  const shootoutA = ispAttA > ispAttB ? pkCurve : 1 - pkCurve
  const shootoutB = 1 - shootoutA

  // v5.1 adds `draw * <empty cell>`, so the penalty row silently echoes the 90'
  // result. The correction consumes the shootout probabilities it already has.
  const afterPenalties = corrections.afterPk
    ? { winA: etWinA + drawEt * shootoutA, winB: etWinB + drawEt * shootoutB }
    : { winA, winB }

  return {
    regulation: { winA, draw, winB },
    afterExtraTime: { winA: etWinA, draw: drawEt, winB: etWinB },
    afterPenalties,
    shootout: { winA: shootoutA, winB: shootoutB },
    scoreline,
  }
}
