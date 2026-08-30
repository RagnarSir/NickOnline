/**
 * Hattrick's own rating vocabulary.
 *
 * The scale is ZERO-based: non-existent = 0 … divine = 20. A rating's integer
 * part is the level index straight into LEVELS, and the quarters are its
 * sublevels — so 12.5 is "magnificent (high)" and 11.75 is "brilliant (very
 * high)". Hattrick numbers tactic and formation levels the same way, which is
 * how this is anchored: it reports "world class (13)" and "formidable (9)",
 * matching LEVELS[13] and LEVELS[9].
 *
 * The engine works in the numeric form (level = rating*4 - 3) and never sees
 * these names; this is purely for display, so managers read the ratings in the
 * language the game gives them.
 */

const LEVELS = [
  'non-existent',
  'disastrous',
  'wretched',
  'poor',
  'weak',
  'inadequate',
  'passable',
  'solid',
  'excellent',
  'formidable',
  'outstanding',
  'brilliant',
  'magnificent',
  'world class',
  'supernatural',
  'titanic',
  'extra-terrestrial',
  'mythical',
  'magical',
  'utopian',
  'divine',
]

const SUBLEVELS = ['very low', 'low', 'high', 'very high']

export interface RatingName {
  level: string
  sublevel: string
  /** "outstanding (very high)" */
  full: string
}

export function ratingName(rating: number): RatingName | null {
  if (!Number.isFinite(rating) || rating < 0) return null
  const floor = Math.floor(rating)
  const quarter = Math.round((rating - floor) * 4)
  // A rating of 11.99 rounds up into level 12's "very low".
  const level = quarter === 4 ? floor + 1 : floor
  const sub = quarter === 4 ? 0 : quarter
  const name = LEVELS[level]
  if (!name) return null
  return { level: name, sublevel: SUBLEVELS[sub], full: `${name} (${SUBLEVELS[sub]})` }
}

/** The level index Hattrick itself reports, e.g. "world class" -> 13. */
export const levelIndex = (name: string): number =>
  LEVELS.indexOf(name.trim().toLowerCase())

/** Short form for tight spaces: "magnificent+" / "brilliant·". */
export function ratingNameShort(rating: number): string {
  const n = ratingName(rating)
  if (!n) return ''
  const mark = { 'very low': '', low: '·', high: '+', 'very high': '++' }[n.sublevel] ?? ''
  return `${n.level}${mark}`
}
