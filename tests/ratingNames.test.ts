import { describe, expect, it } from 'vitest'
import { levelIndex, ratingName } from '../src/lib/ratingNames'

/**
 * The scale is zero-based: non-existent = 0 … divine = 20.
 *
 * Every expectation below traces back to something Hattrick itself reported,
 * rather than to a guess about the numbering — an earlier version of this file
 * encoded a one-level-too-low reading and passed happily.
 */
describe('Hattrick rating names', () => {
  it('matches the levels Hattrick reports by number', () => {
    // "Tactics: Play creatively world class (13)"
    expect(levelIndex('world class')).toBe(13)
    // "Formation: 3-5-2 formidable (9)"
    expect(levelIndex('formidable')).toBe(9)
    expect(levelIndex('non-existent')).toBe(0)
    expect(levelIndex('divine')).toBe(20)
  })

  it('names the ratings from a real match report', () => {
    // Defence 12.5 / 12.25, midfield 10.5, attack 6.25 / 10.75 / 9.5.
    expect(ratingName(12.5)?.full).toBe('magnificent (high)')
    expect(ratingName(12.25)?.full).toBe('magnificent (low)')
    expect(ratingName(10.5)?.full).toBe('outstanding (high)')
    expect(ratingName(6.25)?.full).toBe('passable (low)')
    expect(ratingName(10.75)?.full).toBe('outstanding (very high)')
    expect(ratingName(9.5)?.full).toBe('formidable (high)')
  })

  it('maps the quarters to sublevels', () => {
    expect(ratingName(11)?.full).toBe('brilliant (very low)')
    expect(ratingName(11.25)?.full).toBe('brilliant (low)')
    expect(ratingName(11.5)?.full).toBe('brilliant (high)')
    expect(ratingName(11.75)?.full).toBe('brilliant (very high)')
  })

  it('rounds a near-miss up into the next level', () => {
    expect(ratingName(11.99)?.full).toBe('magnificent (very low)')
  })

  it('covers both ends of the scale', () => {
    expect(ratingName(0)?.full).toBe('non-existent (very low)')
    expect(ratingName(20.75)?.full).toBe('divine (very high)')
  })

  it('returns nothing outside the scale', () => {
    expect(ratingName(21)).toBeNull()
    expect(ratingName(-1)).toBeNull()
    expect(ratingName(NaN)).toBeNull()
  })
})
