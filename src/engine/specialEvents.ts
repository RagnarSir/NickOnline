/** The special-events table (simulator AI4:AY19) and its Q-stop helper. */

import { approx, exact, headerIndex, type Diagnostics } from './lookup'
import { K, T } from './tables'
import {
  adjacent,
  countA,
  countHead,
  countIf,
  mirrorForForward,
  mirrorForMidfielder,
  ranges,
} from './squad'
import type { SeRow, SpecialtyGrid, TeamInput } from './types'

/**
 * AO30:AT36 — each Quick attacker is cancelled outright by a Quick defender
 * facing them, and loses 25% for each Quick defender beside that one.
 * Returns NaN when the team has no Quick attackers (the sheet shows #DIV/0!).
 */
export function qStopFactor(own: SpecialtyGrid, opp: SpecialtyGrid): number {
  const oppDef = opp.def
  let sum = 0

  const contribution = (attacker: string, mirror: number): number => {
    if (attacker !== 'Q') return 0
    if (oppDef[mirror] === 'Q') return 0
    let v = 1
    for (const j of adjacent(mirror)) if (oppDef[j] === 'Q') v -= 0.25
    return v
  }

  // Forwards occupy slots 1-3 but spread across the full defensive width.
  for (let i = 1; i <= 3; i++) sum += contribution(own.fw[i], mirrorForForward(i))
  for (let i = 0; i <= 4; i++) sum += contribution(own.mid[i], mirrorForMidfielder(i))

  return sum / countIf(ranges(own).offensive, 'Q')
}

/** AO2 / AP2 — Play Creatively tilts who wins a contested special event. */
export function eventExponents(pcA: number, pcB: number): { own: number; other: number } {
  const own = pcA > 0 && pcB === 0 ? 4 : pcB > 0 && pcA === 0 ? 2.5 : K.defaultPcExponent
  const other = own === 4 ? 2.5 : own === 2.5 ? 4 : K.defaultPcExponent
  return { own, other }
}

/** AO3 — Play Creatively raises the frequency of every special event. */
export function pcFactor(pcA: number, pcB: number, diag: Diagnostics): number {
  const combined = pcA * pcB > 0 ? Math.floor((pcA + pcB) / 2) : Math.max(pcA, pcB)
  const both = Math.min(pcA * pcB, 0.4) + 1
  return approx(T.approx.pcFactor, combined, 'se.pcFactor', diag) * both
}

/**
 * AW / AN — the share of an event that falls to Team A.
 *
 * When the specialist counts are equal the cell holds a probability; otherwise it
 * holds the exponent for a power contest. That overload is in the original.
 */
function share(nA: number, nB: number, exp: { own: number; other: number }): number {
  let w: number
  if (exp.own === 4) w = nA === nB ? (nA + 1) / (nA + 1 + nB) : nA > nB ? exp.own : exp.other
  else if (exp.own === 2.5) w = nA === nB ? nA / (nA + 1 + nB) : nA > nB ? exp.own : exp.other
  else w = nA === nB ? 0.5 : K.defaultPcExponent

  if (nA === nB) return w
  const r = nA ** w / (nA ** w + nB ** w)
  return Number.isFinite(r) ? r : 0
}

export interface SeContext {
  a: TeamInput
  b: TeamInput
  gridA: SpecialtyGrid
  gridB: SpecialtyGrid
  lsLevelA: number
  lsLevelB: number
  /** AN15 — linearised possession, which drives both corner events. */
  cornerShare: number
  pc: number
  exponents: { own: number; other: number }
  qStopA: number
  qStopB: number
}

interface RowSpec {
  row: number
  event: string
  specialty: string
  countA: (c: SeContext) => number
  countB: (c: SeContext) => number
  /** Rows 13 and 14 hand the event to the *other* team. */
  invert?: boolean
}

const ROWS: RowSpec[] = [
  {
    row: 5,
    event: 'Quick rush',
    specialty: 'Q',
    countA: (c) => countIf(ranges(c.gridA).offensive, 'Q'),
    countB: (c) => countIf(ranges(c.gridB).offensive, 'Q'),
  },
  {
    row: 6,
    event: 'Quick pass',
    specialty: 'Q',
    countA: (c) => countIf(ranges(c.gridA).offensive, 'Q'),
    countB: (c) => countIf(ranges(c.gridB).offensive, 'Q'),
  },
  {
    row: 7,
    event: 'Corner to head (A attacking)',
    specialty: 'H',
    // Attacking side counts plain heads only; the defending side counts its
    // set-piece taker and keeper too.
    countA: (c) => countIf(ranges(c.gridA).outfield, 'H'),
    countB: (c) => countHead(ranges(c.gridB).all),
  },
  {
    row: 8,
    event: 'Corner to head (B attacking)',
    specialty: 'H',
    countA: (c) => countHead(ranges(c.gridA).all),
    countB: (c) => countIf(ranges(c.gridB).outfield, 'H'),
  },
  {
    row: 9,
    event: 'Winger to head',
    specialty: 'H',
    countA: (c) => countHead(ranges(c.gridA).offensive),
    countB: (c) => countHead(ranges(c.gridB).offensive),
  },
  {
    row: 10,
    event: 'Unpredictable long pass',
    specialty: 'U',
    countA: (c) => countIf(ranges(c.gridA).defAndKeeper, 'U'),
    countB: (c) => countIf(ranges(c.gridB).defAndKeeper, 'U'),
  },
  {
    row: 11,
    event: 'Unpredictable special',
    specialty: 'U',
    countA: (c) => countIf(ranges(c.gridA).outfield, 'U'),
    countB: (c) => countIf(ranges(c.gridB).outfield, 'U'),
  },
  {
    row: 12,
    event: 'Unpredictable scores own',
    specialty: 'U',
    countA: (c) => countIf(ranges(c.gridA).offensive, 'U'),
    countB: (c) => countIf(ranges(c.gridB).offensive, 'U'),
  },
  {
    row: 13,
    event: 'Unpredictable mistake',
    specialty: 'U',
    countA: (c) =>
      countIf(ranges(c.gridA).defLine, 'U') + countIf(ranges(c.gridA).innerMid, 'U'),
    countB: (c) =>
      countIf(ranges(c.gridB).defLine, 'U') + countIf(ranges(c.gridB).innerMid, 'U'),
    invert: true,
  },
  {
    row: 14,
    event: 'Unpredictable own goal',
    specialty: 'U',
    countA: (c) => countIf(ranges(c.gridA).wingers, 'U') + countIf(ranges(c.gridA).fwLine, 'U'),
    countB: (c) => countIf(ranges(c.gridB).wingers, 'U') + countIf(ranges(c.gridB).fwLine, 'U'),
    invert: true,
  },
  { row: 15, event: 'Corner to anyone', specialty: '-', countA: () => 0, countB: () => 0 },
  {
    row: 16,
    event: 'Winger to anyone',
    specialty: '-',
    countA: (c) => countA(ranges(c.gridA).wingers),
    countB: (c) => countA(ranges(c.gridB).wingers),
  },
  {
    row: 17,
    event: 'Technical to head',
    specialty: 'T',
    // Worth nothing unless the opponent has at least one head specialist.
    countA: (c) =>
      countIf(ranges(c.gridA).offensive, 'T') * Math.min(1, countHead(ranges(c.gridB).midDefKeeper)),
    countB: (c) =>
      countIf(ranges(c.gridB).offensive, 'T') * Math.min(1, countHead(ranges(c.gridA).midDefKeeper)),
  },
  { row: 18, event: 'All others', specialty: '-', countA: () => 0, countB: () => 0 },
]

const safe = (x: number): number => (Number.isFinite(x) ? x : 0)

export function specialEvents(c: SeContext, diag: Diagnostics): SeRow[] {
  const gkHeader = T.convKstars.gkStars
  const idxAgainstB = headerIndex(gkHeader, c.b.gkStars, 'teamB.gkStars', diag)
  const idxAgainstA = headerIndex(gkHeader, c.a.gkStars, 'teamA.gkStars', diag)

  /** Conversion for a shot faced by the given keeper. */
  const conv = (row: number, gkIdx: number): number => {
    const table = T.convKstars.rows[String(K.seConvRow[String(row)])]
    if (!table || gkIdx < 0) return 0
    return table[gkIdx] ?? 0
  }

  const playerFactor = (n: number, field: string) =>
    exact(T.exact.sePlayerFactor, n, field, diag)

  return ROWS.map((spec): SeRow => {
    const base = K.seBaseFreq[String(spec.row)]
    const nA = spec.countA(c)
    const nB = spec.countB(c)

    let freqA = 0
    let freqB = 0
    let convA = 0
    let convB = 0
    let sh = 0

    switch (spec.row) {
      case 7: {
        // Corner to head: only the attacking side gets the event, and it is
        // split by possession rather than by a specialist contest.
        sh = c.cornerShare
        const f = exact(T.exact.seCornerHeadFactor, nA, 'se.cornerHeadFactor.A', diag)
        freqA = base * f * sh * c.pc
        convA =
          approx(T.approx.ispFactorHead, (c.a.ispAtt - c.b.ispDef) * 4, 'se.ispHead.A', diag) *
          approx(T.approx.cornerHeadConv, nA - nB, 'se.cornerHeadConv.A', diag)
        break
      }
      case 8: {
        sh = c.cornerShare
        const f = exact(T.exact.seCornerHeadFactor, nB, 'se.cornerHeadFactor.B', diag)
        freqB = base * f * (1 - sh) * c.pc
        convB =
          approx(T.approx.ispFactorHead, (c.b.ispAtt - c.a.ispDef) * 4, 'se.ispHead.B', diag) *
          approx(T.approx.cornerHeadConv, nB - nA, 'se.cornerHeadConv.B', diag)
        break
      }
      case 15: {
        sh = c.cornerShare
        freqA = base * sh * c.pc
        freqB = base * (1 - sh) * c.pc
        convA =
          approx(T.approx.ispFactorCorner, (c.a.ispAtt - c.b.ispDef) * 4, 'se.ispCorner.A', diag) *
          approx(T.approx.kFactorCorner, c.b.gkStars - c.lsLevelA / 4, 'se.kCorner.A', diag)
        convB =
          approx(T.approx.ispFactorCorner, (c.b.ispAtt - c.a.ispDef) * 4, 'se.ispCorner.B', diag) *
          approx(T.approx.kFactorCorner, c.a.gkStars - c.lsLevelB / 4, 'se.kCorner.B', diag)
        break
      }
      case 18: {
        sh = K.allOthersSplit
        freqA = base * sh * c.pc
        freqB = base * (1 - sh) * c.pc
        convA = conv(spec.row, idxAgainstB)
        convB = conv(spec.row, idxAgainstA)
        break
      }
      default: {
        sh = share(nA, nB, c.exponents)
        if (spec.invert) sh = 1 - sh
        const f = playerFactor(Math.max(nA, nB), `se.playerFactor.row${spec.row}`)
        freqA = base * f * sh * c.pc
        freqB = base * f * (1 - sh) * c.pc

        if (spec.row === 9) {
          // A lone head specialist who *is* the winger can only be one or the
          // other, so the event is halved.
          const headWingersA = countIf(ranges(c.gridA).wingers, 'H')
          const headWingersB = countIf(ranges(c.gridB).wingers, 'H')
          if (nA * headWingersA === 1) freqA *= 0.5
          if (nB * headWingersB === 1) freqB *= 0.5
        }

        convA = conv(spec.row, idxAgainstB)
        convB = conv(spec.row, idxAgainstA)

        if (spec.row === 5 || spec.row === 6) {
          convA *= c.qStopA
          convB *= c.qStopB
        }
        break
      }
    }

    return {
      event: spec.event,
      specialty: spec.specialty,
      countA: nA,
      countB: nB,
      share: sh,
      freqA,
      freqB,
      convA,
      convB,
      goalsA: safe(freqA * convA),
      goalsB: safe(freqB * convB),
    }
  })
}
