/**
 * Parity with Simulator_v5_1.xlsx.
 *
 * The workbook's own cached values are the oracle. Intermediates are asserted as
 * well as headline numbers so a regression points at the stage that broke rather
 * than just "the answer moved".
 */

import { describe, expect, it } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { NO_CORRECTIONS, type Corrections } from '../src/engine/types'
import { cell, goldenInput } from './fixture'

const r = simulate(goldenInput, NO_CORRECTIONS)

/** Excel keeps ~15 significant digits; anything looser would hide real drift. */
const near = (actual: number, ref: string, precision = 12) =>
  expect(actual, `${ref} (workbook ${cell(ref)})`).toBeCloseTo(cell(ref), precision)

describe('possession and sector conversion', () => {
  it('splits midfield possession', () => {
    near(r.teamA.possession, 'C7')
    near(r.teamB.possession, 'C8')
  })

  it('converts each sector', () => {
    near(r.teamA.sectors[0].conv, 'V7')
    near(r.teamA.sectors[1].conv, 'V8')
    near(r.teamA.sectors[2].conv, 'V9')
    near(r.teamB.sectors[0].conv, 'AB7')
    near(r.teamB.sectors[1].conv, 'AB8')
    near(r.teamB.sectors[2].conv, 'AB9')
  })

  it('rates set pieces and long shots', () => {
    near(r.teamA.sectors[3].conv, 'V10')
    near(r.teamA.sectors[4].conv, 'V11')
    near(r.teamA.sectors[5].conv, 'V12')
    near(r.teamA.sectors[6].conv, 'V13')
    near(r.teamB.sectors[3].conv, 'AB10')
    near(r.teamB.sectors[4].conv, 'AB11')
    near(r.teamB.sectors[5].conv, 'AB12')
    near(r.teamB.sectors[6].conv, 'AB13')
  })
})

describe('chance funnel', () => {
  it('removes chances for pressing', () => near(r.teamA.chancesAfterPress, 'U3'))

  it('splits by possession and PDIM', () => {
    near(r.teamA.chancesAfterPoss, 'X2')
    near(r.teamB.chancesAfterPoss, 'AD2')
    near(r.teamA.chancesAfterPdim, 'X3')
    near(r.teamB.chancesAfterPdim, 'AD3')
  })

  it('presses long shots', () => {
    near(r.teamA.pressLsPct, 'X4')
    near(r.teamB.pressLsPct, 'AD4')
  })
})

describe('chance distribution', () => {
  const distCells = ['W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13']
  const chanceCells = ['X7', 'X8', 'X9', 'X10', 'X11', 'X12', 'X13']
  const goalCells = ['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13']

  it('distributes Team A chances', () => {
    r.teamA.sectors.forEach((s, i) => near(s.dist, distCells[i]))
    r.teamA.sectors.forEach((s, i) => near(s.chances, chanceCells[i]))
    r.teamA.sectors.forEach((s, i) => near(s.goals, goalCells[i]))
  })

  it('distributes Team B chances', () => {
    const b = ['AC7', 'AC8', 'AC9', 'AC10', 'AC11', 'AC12', 'AC13']
    const bc = ['AD7', 'AD8', 'AD9', 'AD10', 'AD11', 'AD12', 'AD13']
    const bg = ['AE7', 'AE8', 'AE9', 'AE10', 'AE11', 'AE12', 'AE13']
    r.teamB.sectors.forEach((s, i) => near(s.dist, b[i]))
    r.teamB.sectors.forEach((s, i) => near(s.chances, bc[i]))
    r.teamB.sectors.forEach((s, i) => near(s.goals, bg[i]))
  })

  it('sums to the workbook totals', () => {
    near(r.teamA.sectors.reduce((s, x) => s + x.chances, 0), 'X15')
    near(r.teamA.sectors.reduce((s, x) => s + x.goals, 0), 'Y15')
    near(r.teamB.sectors.reduce((s, x) => s + x.chances, 0), 'AD15')
    near(r.teamB.sectors.reduce((s, x) => s + x.goals, 0), 'AE15')
  })
})

describe('counter-attacks and PNF', () => {
  it('rates counter-attacks', () => {
    near(r.teamA.caPct, 'Z2')
    near(r.teamB.caPct, 'AF2')
    near(r.teamA.uCounterAttacks, 'Z3')
    near(r.teamB.uCounterAttacks, 'AF3')
    near(r.teamA.counterAttacks, 'Z4')
    near(r.teamB.counterAttacks, 'AF4')
  })

  it('distributes counter-attack chances', () => {
    const ca = ['Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12']
    ca.forEach((ref, i) => near(r.teamA.sectors[i].caChances, ref))
    const cag = ['AA7', 'AA8', 'AA9', 'AA10', 'AA11', 'AA12']
    cag.forEach((ref, i) => near(r.teamA.sectors[i].caGoals, ref))
  })

  it('converts powerful forwards', () => {
    near(r.teamA.pnfChances, 'Z14')
    near(r.teamA.pnfGoals, 'AA14')
    near(r.teamB.pnfChances, 'AF14')
    near(r.teamB.pnfGoals, 'AG14')
  })
})

describe('special events', () => {
  const rows = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

  it('counts specialists', () => {
    rows.forEach((row, i) => {
      if (row === 15 || row === 18) return
      near(r.se[i].countA, `AL${row}`, 10)
      near(r.se[i].countB, `AM${row}`, 10)
    })
  })

  it('sets frequencies', () => {
    rows.forEach((row, i) => {
      if (row !== 8) near(r.se[i].freqA, `AO${row}`)
      if (row !== 7) near(r.se[i].freqB, `AP${row}`)
    })
  })

  it('sets conversions', () => {
    rows.forEach((row, i) => {
      if (row !== 8) near(r.se[i].convA, `AQ${row}`)
      if (row !== 7) near(r.se[i].convB, `AR${row}`)
    })
  })

  it('totals goals', () => {
    near(r.se.reduce((s, x) => s + x.freqA, 0), 'AO19')
    near(r.se.reduce((s, x) => s + x.freqB, 0), 'AP19')
    near(r.se.reduce((s, x) => s + x.goalsA, 0), 'AS19')
    near(r.se.reduce((s, x) => s + x.goalsB, 0), 'AT19')
  })

  it('applies the Play Creatively multiplier', () => near(r.pcFactor, 'AO3'))
})

describe('HTS', () => {
  it('matches each component', () => {
    near(r.teamA.htsParts.att, 'BB9')
    near(r.teamA.htsParts.mid, 'BB10')
    near(r.teamA.htsParts.def, 'BB11')
    near(r.teamA.htsParts.ls, 'BB12')
    near(r.teamB.htsParts.att, 'BC9')
    near(r.teamB.htsParts.mid, 'BC10')
    near(r.teamB.htsParts.def, 'BC11')
    near(r.teamB.htsParts.ls, 'BC12')
  })

  it('matches the score and its neutral form', () => {
    near(r.teamA.hts, 'P9', 10)
    near(r.teamB.hts, 'R9', 10)
    near(r.teamA.htsn, 'E27', 10)
    near(r.teamB.htsn, 'F27', 10)
  })
})

describe('report', () => {
  it('breaks chances down', () => {
    near(r.teamA.chances.lcr, 'P12')
    near(r.teamA.chances.setPiece, 'P13')
    near(r.teamA.chances.ls, 'P14')
    near(r.teamA.chances.ca, 'P15')
    near(r.teamA.chances.pnf, 'P16')
    near(r.teamA.chances.se, 'P17')
    near(r.teamA.chances.total, 'P11')
    near(r.teamB.chances.total, 'R11')
  })

  it('breaks goals down', () => {
    near(r.teamA.goals.lcr, 'P19')
    near(r.teamA.goals.setPiece, 'P20')
    near(r.teamA.goals.ls, 'P21')
    near(r.teamA.goals.ca, 'P22')
    near(r.teamA.goals.pnf, 'P23')
    near(r.teamA.goals.se, 'P24')
    near(r.teamB.goals.ca, 'R22')
  })
})

describe('goal distribution', () => {
  it('matches the Poisson grid', () => {
    for (let k = 0; k <= 10; k++) {
      near(r.teamA.goalDist[k], `P${27 + k}`)
      near(r.teamB.goalDist[k], `R${27 + k}`)
    }
  })
})

describe('outcomes', () => {
  it('reproduces the headline probabilities', () => {
    near(r.regulation.winA, 'P2')
    near(r.regulation.draw, 'Q2')
    near(r.regulation.winB, 'R2')
  })

  it('reproduces xG, xP and HTS', () => {
    near(r.teamA.xg, 'P7')
    near(r.teamB.xg, 'R7')
    near(r.teamA.xp, 'P8')
    near(r.teamB.xp, 'R8')
  })

  it('reproduces extra time and the shootout', () => {
    near(r.afterExtraTime.draw, 'Q4')
    near(r.afterExtraTime.winA, 'P4')
    near(r.afterExtraTime.winB, 'R4')
    near(r.shootout.winA, 'P5')
    near(r.shootout.winB, 'R5')
  })

  it('reproduces the dead "after penalties" row', () => {
    // v5.1 adds draw * <empty cell>, so this equals the 90' result.
    near(r.afterPenalties.winA, 'P6')
    near(r.afterPenalties.winB, 'R6')
    expect(r.afterPenalties.winA).toBe(r.regulation.winA)
  })

  it('sums the scoreline grid to 1', () => {
    const total = r.scoreline.flat().reduce((s, x) => s + x, 0)
    expect(total).toBeCloseTo(1, 12)
  })
})

describe('acceptance criterion', () => {
  it('matches the saved workbook state exactly', () => {
    expect(r.regulation.winA).toBeCloseTo(0.69244254482418643, 15)
    expect(r.regulation.draw).toBeCloseTo(0.190991628369096, 15)
    expect(r.regulation.winB).toBeCloseTo(0.11656582680671748, 15)
    expect(r.teamA.xg).toBeCloseTo(2.0913467912928296, 14)
    expect(r.teamB.xg).toBeCloseTo(0.71968398063764982, 14)
    expect(r.teamA.hts).toBeCloseTo(293.30402873397122, 10)
    expect(r.teamB.hts).toBeCloseTo(345.05153703079947, 10)
  })

  it('reports no errors for a valid matchup', () => {
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })
})

describe('corrections', () => {
  const withFix = (fix: keyof Corrections) =>
    simulate(goldenInput, { ...NO_CORRECTIONS, [fix]: true })

  it('afterPk consumes the shootout probabilities', () => {
    const fixed = withFix('afterPk')
    expect(fixed.afterPenalties.winA).not.toBe(fixed.regulation.winA)
    expect(fixed.afterPenalties.winA + fixed.afterPenalties.winB).toBeCloseTo(1, 12)
    // Nothing before the final row moves.
    expect(fixed.teamA.xg).toBe(r.teamA.xg)
    expect(fixed.regulation.winA).toBe(r.regulation.winA)
  })

  it('teamBCounterAttacks adds the missing U term', () => {
    // The saved matchup gives Team A no Unpredictable players, so the workbook's
    // own AF3 is 0 and the bug is invisible. Give Team A some to expose it.
    const withU: typeof goldenInput = {
      ...goldenInput,
      teamA: {
        ...goldenInput.teamA,
        specialties: {
          ...goldenInput.teamA.specialties,
          mid: ['U', 'PDIM', 'U', 'U', 'U'],
        },
      },
    }
    const base = simulate(withU, NO_CORRECTIONS)
    const fixed = simulate(withU, { ...NO_CORRECTIONS, teamBCounterAttacks: true })

    expect(base.teamB.uCounterAttacks).toBeGreaterThan(0)
    expect(base.teamB.counterAttacks).toBeCloseTo(fixed.teamB.counterAttacks - base.teamB.uCounterAttacks, 12)
    expect(fixed.teamB.xg).toBeGreaterThan(base.teamB.xg)
    expect(fixed.teamA.xg).toBe(base.teamA.xg)
  })

  it('leaves Team B counter-attacks alone when the U term is genuinely zero', () => {
    // Parity check against the workbook's AF3 = 0 for the saved matchup.
    expect(r.teamB.uCounterAttacks).toBe(0)
    expect(withFix('teamBCounterAttacks').teamB.counterAttacks).toBe(r.teamB.counterAttacks)
  })

  it('teamBHtsWeights and aimCentreWeight only move HTS', () => {
    const w = withFix('teamBHtsWeights')
    expect(w.regulation.winA).toBe(r.regulation.winA)
    const aim = withFix('aimCentreWeight')
    expect(aim.regulation.winA).toBe(r.regulation.winA)
  })

  it('percentLinearise leaves this matchup unchanged', () => {
    // Team A already has >= 50% possession under both readings, so the gate
    // resolves the same way; the fix matters for matchups near the boundary.
    const fixed = withFix('percentLinearise')
    expect(fixed.teamA.caPct).toBe(r.teamA.caPct)
  })
})
