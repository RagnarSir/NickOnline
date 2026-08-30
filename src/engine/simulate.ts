/**
 * The whole model, in the workbook's own dependency order.
 *
 * simulate() is pure: same input, same output, no side effects and no framework
 * dependencies, so it can be exercised directly by the parity test.
 */

import { chanceTable, chancesAfterPressing, pressLsPct } from './chances'
import { attackWeights, computeHts, computeHtsn } from './hts'
import { Diagnostics, exact, exactStr } from './lookup'
import { goalDistribution, outcomes } from './outcome'
import { levels, ratingsPossession, sectorConv } from './ratings'
import { eventExponents, pcFactor, qStopFactor, specialEvents } from './specialEvents'
import { countA, countIf, ranges } from './squad'
import { K, T } from './tables'
import type {
  Corrections,
  MatchInput,
  MatchResult,
  SeRow,
  TeamInput,
  TeamResult,
  Tactic,
} from './types'
import { NO_CORRECTIONS } from './types'

/** AA31:AB36 — a tactic's level counts only for the tactic actually chosen. */
const levelFor = (t: TeamInput, tactic: Tactic): number => (t.tactic === tactic ? t.tacticLevel : 0)

const tacticLevels = (t: TeamInput) => ({
  counterAttacks: levelFor(t, 'Counter Attacks'),
  longShots: levelFor(t, 'Long Shots'),
  playCreatively: levelFor(t, 'Play Creatively'),
  pressing: levelFor(t, 'Pressing'),
  attackOnWings: levelFor(t, 'Attack on Wings'),
  attackInMiddle: levelFor(t, 'Attack in Middle'),
})

export function simulate(
  input: MatchInput,
  corrections: Corrections = NO_CORRECTIONS,
): MatchResult {
  const diag = new Diagnostics()
  const { teamA: a, teamB: b } = input
  const gridA = a.specialties
  const gridB = b.specialties

  const tacA = tacticLevels(a)
  const tacB = tacticLevels(b)

  const lvlA = levels(a)
  const lvlB = levels(b)

  // --- possession -------------------------------------------------------
  const ratingsPossA = ratingsPossession(lvlA, lvlB)
  const percentPossA = a.possession
  const possA = input.ratingsMode === 'Percent' ? percentPossA : ratingsPossA
  const possB = 1 - possA

  // AN15 — the *linear* midfield ratio, which is what corner events want. In
  // Percent mode v5.1 inverts the cubic through a lookup table.
  const cornerShare =
    input.ratingsMode === 'Ratings'
      ? lvlA.mid / (lvlA.mid + lvlB.mid)
      : (T.possessionLinear[Math.round(percentPossA * 100)] ?? 0)

  const linearise = corrections.percentLinearise && input.ratingsMode === 'Percent'

  // --- special events ---------------------------------------------------
  const pc = pcFactor(tacA.playCreatively, tacB.playCreatively, diag)
  const exponents = eventExponents(tacA.playCreatively, tacB.playCreatively)
  // A side with no Quick attackers divides by zero here, exactly as the
  // spreadsheet does (#DIV/0! in AO33). It is deliberately not reported: the
  // Quick event frequency is already 0 in that case, so the NaN is always
  // multiplied by zero and never reaches a result. Warning about it would fire
  // on most real lineups — and on an empty one — while telling you only that a
  // team without Quick players gets no Quick events.
  const qStopA = qStopFactor(gridA, gridB)
  const qStopB = qStopFactor(gridB, gridA)

  const se = specialEvents(
    { a, b, gridA, gridB, lsLevelA: tacA.longShots, lsLevelB: tacB.longShots, cornerShare, pc, exponents, qStopA, qStopB },
    diag,
  )
  const seSum = (pick: (r: SeRow) => number) => se.reduce((s, r) => s + pick(r), 0)

  // --- chance funnel ----------------------------------------------------
  const afterPress = chancesAfterPressing(tacA.pressing, tacB.pressing, diag)
  const afterPossA = afterPress * possA
  const afterPossB = afterPress * possB

  const pdimA = countIf(ranges(gridA).innerMid, 'PDIM')
  const pdimB = countIf(ranges(gridB).innerMid, 'PDIM')
  const afterPdimA = afterPossA * (1 - exact(T.exact.pdimStopped, pdimB, 'teamB.pdim', diag))
  const afterPdimB = afterPossB * (1 - exact(T.exact.pdimStopped, pdimA, 'teamA.pdim', diag))

  const lsPressA = pressLsPct(tacA.longShots, tacB.pressing, diag, 'teamA')
  const lsPressB = pressLsPct(tacB.longShots, tacA.pressing, diag, 'teamB')

  const convA = sectorConv(input, a, lvlA, lvlB)
  const convB = sectorConv(input, b, lvlB, lvlA)

  const chanceInputA = {
    who: 'teamA',
    chancesAfterPdim: afterPdimA,
    counterAttacks: 0,
    sectorConv: convA,
    ownIspAtt: a.ispAtt,
    oppIspDef: b.ispDef,
    lsLevel: tacA.longShots,
    aimLevel: tacA.attackInMiddle,
    aowLevel: tacA.attackOnWings,
    pressLsPct: lsPressA,
    lsGate: 'tactic' as const,
    playsLongShots: a.tactic === 'Long Shots',
    tacticLevel: a.tacticLevel,
  }
  const chanceInputB = {
    who: 'teamB',
    chancesAfterPdim: afterPdimB,
    counterAttacks: 0,
    sectorConv: convB,
    ownIspAtt: b.ispAtt,
    oppIspDef: a.ispDef,
    lsLevel: tacB.longShots,
    aimLevel: tacB.attackInMiddle,
    aowLevel: tacB.attackOnWings,
    pressLsPct: lsPressB,
    lsGate: 'level' as const,
    playsLongShots: b.tactic === 'Long Shots',
    tacticLevel: b.tacticLevel,
  }

  // First pass establishes each side's missed normal chances, which is what
  // feeds the *opponent's* counter-attacks.
  const missedA = chanceTable(chanceInputA, diag).missedNormal
  const missedB = chanceTable(chanceInputB, diag).missedNormal

  // --- counter-attacks --------------------------------------------------
  const caPct = (
    own: typeof gridA,
    caLevel: number,
    ownPoss: number,
    who: string,
  ): number => {
    const defenders = countA(ranges(own).defLine)
    const nonTactical = ownPoss >= 0.5 || caLevel === 0
    const base = nonTactical
      ? exactStr(T.exact.caPctByDefenders, `${defenders}D`, `${who}.caDefenders`, diag)
      : exact(T.exact.caPctByLevel, caLevel, `${who}.caLevel`, diag)
    return base + exact(T.exact.techDefCaBonus, countIf(ranges(own).defLine, 'T'), `${who}.techDef`, diag)
  }

  // v5.1 gates on the *ratings* possession even in Percent mode; the correction
  // uses the entered percentage instead.
  const caGatePossA = linearise ? possA : ratingsPossA
  const caGatePossB = linearise ? possB : 1 - ratingsPossA

  const caPctA = caPct(gridA, tacA.counterAttacks, caGatePossA, 'teamA')
  const caPctB = caPct(gridB, tacB.counterAttacks, caGatePossB, 'teamB')

  // 5% of the opponent's missed Unpredictable events turn into counter-attacks.
  const uRows = se.filter((r) => r.event === 'Unpredictable special' || r.event === 'Unpredictable scores own')
  const uCaA = 0.05 * uRows.reduce((s, r) => s + r.freqB - r.goalsB, 0)
  const uCaB = 0.05 * uRows.reduce((s, r) => s + r.freqA - r.goalsA, 0)

  const caA = missedB * caPctA + uCaA
  // v5.1 omits the U-counter-attack term for Team B.
  const caB = missedA * caPctB + (corrections.teamBCounterAttacks ? uCaB : 0)

  const tableA = chanceTable({ ...chanceInputA, counterAttacks: caA }, diag)
  const tableB = chanceTable({ ...chanceInputB, counterAttacks: caB }, diag)

  // --- PNF --------------------------------------------------------------
  // Powerful forwards convert missed chances, but not missed long shots.
  const pnf = (
    table: typeof tableA,
    ownGrid: typeof gridA,
    oppGrid: typeof gridA,
    who: string,
  ) => {
    const key = `${countIf(ranges(ownGrid).forwards, 'PNF')}_${countA(ranges(oppGrid).centralDefenders)}`
    const freq = exactStr(T.exact.pnfFreq, key, `${who}.pnf`, diag)
    const nonLs = table.sectors.slice(0, 6)
    const missedNonLs =
      nonLs.reduce((s, r) => s + r.chances, 0) - nonLs.reduce((s, r) => s + r.goals, 0)
    const chances = missedNonLs * freq
    return { chances, goals: chances * K.pnfConv }
  }
  const pnfA = pnf(tableA, gridA, gridB, 'teamA')
  const pnfB = pnf(tableB, gridB, gridA, 'teamB')

  // --- HTS --------------------------------------------------------------
  const weightsA = attackWeights(tacA.attackInMiddle, tacA.attackOnWings, corrections)
  const weightsB = attackWeights(tacB.attackInMiddle, tacB.attackOnWings, corrections)

  const midRatioA = linearise ? cornerShare / (1 - cornerShare) : a.mid / b.mid
  const midRatioB = linearise ? (1 - cornerShare) / cornerShare : b.mid / a.mid

  const htsA = computeHts(
    { team: a, caLevel: tacA.counterAttacks, lsLevel: tacA.longShots, midRatio: midRatioA, attWeights: weightsA },
    diag,
    'teamA',
  )
  const htsB = computeHts(
    {
      team: b,
      caLevel: tacB.counterAttacks,
      lsLevel: tacB.longShots,
      midRatio: midRatioB,
      // v5.1 builds Team B's attack aggregate from Team A's tactic weights.
      attWeights: corrections.teamBHtsWeights ? weightsB : weightsA,
    },
    diag,
    'teamB',
  )

  // --- report -----------------------------------------------------------
  const withSpecialties = input.specialtiesMode === 'Yes'
  const seChancesA = withSpecialties ? seSum((r) => r.freqA) : 0.5 * pc
  const seChancesB = withSpecialties ? seSum((r) => r.freqB) : 0.5 * pc
  const seGoalsA = withSpecialties ? seSum((r) => r.goalsA) : 0.48 * seChancesA
  const seGoalsB = withSpecialties ? seSum((r) => r.goalsB) : 0.48 * seChancesB

  const bundle = (
    table: typeof tableA,
    pnfPart: { chances: number; goals: number },
    seCh: number,
    seG: number,
  ) => {
    const s = table.sectors
    const chances = {
      lcr: s[0].chances + s[1].chances + s[2].chances,
      setPiece: s[3].chances + s[4].chances + s[5].chances,
      ls: s[6].chances,
      ca: s.reduce((t, r) => t + r.caChances, 0),
      pnf: pnfPart.chances,
      se: seCh,
      total: 0,
    }
    chances.total = chances.lcr + chances.setPiece + chances.ls + chances.ca + chances.pnf + chances.se
    const goals = {
      lcr: s[0].goals + s[1].goals + s[2].goals,
      setPiece: s[3].goals + s[4].goals + s[5].goals,
      ls: s[6].goals,
      ca: s.reduce((t, r) => t + r.caGoals, 0),
      pnf: pnfPart.goals,
      se: seG,
      total: 0,
    }
    goals.total = goals.lcr + goals.setPiece + goals.ls + goals.ca + goals.pnf + goals.se
    return { chances, goals }
  }

  const partsA = bundle(tableA, pnfA, seChancesA, seGoalsA)
  const partsB = bundle(tableB, pnfB, seChancesB, seGoalsB)

  const xgA = partsA.goals.total
  const xgB = partsB.goals.total

  const distA = goalDistribution(xgA)
  const distB = goalDistribution(xgB)
  const out = outcomes(distA, distB, xgA, xgB, a.ispAtt, b.ispAtt, corrections, diag)

  const teamResult = (
    team: TeamInput,
    hts: typeof htsA,
    table: typeof tableA,
    parts: typeof partsA,
    pnfPart: { chances: number; goals: number },
    dist: number[],
    poss: number,
    afterPoss: number,
    afterPdim: number,
    lsPress: number,
    caPctVal: number,
    uCa: number,
    ca: number,
    tac: ReturnType<typeof tacticLevels>,
    win: number,
    drawP: number,
    who: string,
  ): TeamResult => ({
    xg: parts.goals.total,
    xp: win * 3 + drawP,
    hts: hts.hts,
    htsn: computeHtsn(hts.hts, team.location, input.extraTime, input.manmarking, diag, who),
    htsParts: hts.parts,
    possession: poss,
    chancesAfterPress: afterPress,
    chancesAfterPoss: afterPoss,
    chancesAfterPdim: afterPdim,
    pressLsPct: lsPress,
    caPct: caPctVal,
    uCounterAttacks: uCa,
    counterAttacks: ca,
    sectors: table.sectors,
    pnfChances: pnfPart.chances,
    pnfGoals: pnfPart.goals,
    chances: parts.chances,
    goals: parts.goals,
    goalDist: dist,
    tacticLevels: tac,
  })

  return {
    teamA: teamResult(a, htsA, tableA, partsA, pnfA, distA, possA, afterPossA, afterPdimA, lsPressA, caPctA, uCaA, caA, tacA, out.regulation.winA, out.regulation.draw, 'teamA'),
    teamB: teamResult(b, htsB, tableB, partsB, pnfB, distB, possB, afterPossB, afterPdimB, lsPressB, caPctB, uCaB, caB, tacB, out.regulation.winB, out.regulation.draw, 'teamB'),
    se,
    regulation: out.regulation,
    afterExtraTime: out.afterExtraTime,
    afterPenalties: out.afterPenalties,
    shootout: out.shootout,
    scoreline: out.scoreline,
    pcFactor: pc,
    diagnostics: diag.items,
  }
}
