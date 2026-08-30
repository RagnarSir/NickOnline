import { describe, expect, it } from 'vitest'
import { parseHattrick, parseLineup, parseRatings } from '../src/import/parseHattrick'
// The fixtures are the user's real clipboard output, kept verbatim.
import RATINGS from './fixtures/hattrick-ratings.txt?raw'
import LINEUP from './fixtures/hattrick-lineup.txt?raw'

describe('ratings paste', () => {
  const { found, warnings } = parseRatings(RATINGS)

  it('reverses Hattrick’s right-to-left sector order', () => {
    // Pasted as 6.25 | 10.75 | 9.5, which is Right, Centre, Left.
    expect(found.att).toEqual([9.5, 10.75, 6.25])
    expect(found.def).toEqual([12.5, 12.25, 12.5])
  })

  it('reads midfield from the colspan row', () => {
    expect(found.mid).toBe(10.5)
  })

  it('reads the tactic and its level straight from the text', () => {
    // "Play creatively world class (13)"
    expect(found.tactic).toBe('Play Creatively')
    expect(found.tacticLevel).toBe(13)
  })

  it('parses cleanly', () => {
    expect(warnings).toEqual([])
  })
})

describe('lineup paste', () => {
  const { found, players, warnings } = parseLineup(LINEUP)

  it('places specialties left to right, mirroring the paste', () => {
    // RB Andre(U) RCD - MCD Sira(H) LCD - LB Naillo(U)  ->  reversed
    expect(found.specialties!.def).toEqual(['U', '', 'H', '', 'U'])
    expect(found.specialties!.mid).toEqual(['U', 'H', 'H', 'H', 'T'])
    expect(found.specialties!.fw).toEqual(['', 'Q', '', 'PNF', ''])
    expect(found.specialties!.gk).toEqual(['', '', 'U', '', ''])
  })

  it('maps Powerful by position', () => {
    // Evariste is RFW, so Powerful means PNF rather than PDIM.
    const evariste = players.find((p) => p.name.includes('Evariste'))
    expect(evariste?.position).toBe('RFW')
    expect(evariste?.specialty).toBe('PNF')
  })

  it('strips individual-order markers from names', () => {
    expect(players.find((p) => p.position === 'LB')?.name).toBe('R. Naillo')
    expect(players.find((p) => p.position === 'RW')?.name).toBe('A. Olibert')
  })

  it('ignores the substitutes bench', () => {
    expect(players).toHaveLength(11)
    expect(players.some((p) => p.name.includes('Tham'))).toBe(false)
    expect(players.some((p) => p.name.includes('Ceneac'))).toBe(false)
  })

  it('parses cleanly', () => {
    expect(warnings).toEqual([])
  })
})

describe('both blocks together', () => {
  const r = parseHattrick(`${RATINGS}\n${LINEUP}`)

  it('fills every field a paste can supply', () => {
    expect(r.found.att).toEqual([9.5, 10.75, 6.25])
    expect(r.found.mid).toBe(10.5)
    expect(r.found.def).toEqual([12.5, 12.25, 12.5])
    expect(r.found.tactic).toBe('Play Creatively')
    expect(r.found.tacticLevel).toBe(13)
    expect(r.found.specialties).toBeDefined()
    expect(r.empty).toBe(false)
  })

  it('never invents the fields Hattrick does not export', () => {
    expect(r.found.ispDef).toBeUndefined()
    expect(r.found.ispAtt).toBeUndefined()
    expect(r.found.gkStars).toBeUndefined()
    expect(r.missing.join(' ')).toMatch(/set-piece ratings and keeper stars/)
  })

  it('works whichever order the two blocks are pasted in', () => {
    const flipped = parseHattrick(`${LINEUP}\n${RATINGS}`)
    expect(flipped.found).toEqual(r.found)
  })
})

describe('partial and bad input', () => {
  it('takes ratings alone and says what is missing', () => {
    const r = parseHattrick(RATINGS)
    expect(r.found.att).toEqual([9.5, 10.75, 6.25])
    expect(r.found.specialties).toBeUndefined()
    expect(r.missing.join(' ')).toMatch(/specialties/)
    expect(r.empty).toBe(false)
  })

  it('takes a lineup alone and says what is missing', () => {
    const r = parseHattrick(LINEUP)
    expect(r.found.specialties).toBeDefined()
    expect(r.found.att).toBeUndefined()
    expect(r.missing.join(' ')).toMatch(/ratings, tactic and tactic level/)
  })

  it('reports junk as empty rather than half-filling a team', () => {
    const r = parseHattrick('just some text I copied by mistake')
    expect(r.empty).toBe(true)
    expect(r.found).toEqual({})
  })

  it('warns when a tactic level is outside the model’s data', () => {
    const { warnings } = parseRatings('[b]Tactics[/b]: Pressing divine (20)')
    expect(warnings.join(' ')).toMatch(/outside the range/)
  })

  it('treats Normal as no tactic', () => {
    const { found } = parseRatings('[b]Tactics[/b]: Normal')
    expect(found.tactic).toBe('(no tactic)')
    expect(found.tacticLevel).toBe(0)
  })
})
