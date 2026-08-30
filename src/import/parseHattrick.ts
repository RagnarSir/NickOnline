/**
 * Parse the BBCode Hattrick puts on your clipboard.
 *
 * Hattrick offers two copies — one for the ratings, one for the lineup — and
 * this accepts either, or both pasted together. Everything is pure: text in,
 * a partial TeamInput plus warnings out. Nothing is applied here.
 *
 * The one thing to hold on to: **Hattrick orders sectors Right → Left**
 * (`RB … LB`, and the ratings rows to match), while this app orders them
 * Left → Right. Every row is reversed on the way in. A missed flip still
 * produces plausible numbers, so it is the detail worth testing hardest.
 */

import { levelIndex } from '../lib/ratingNames'
import { TACTICS, type Line, type Specialty, type SpecialtyGrid, type Tactic, type TeamInput } from '../engine/types'

export interface ImportedPlayer {
  position: string
  name: string
  specialty: Specialty
  /** What Hattrick called it, before mapping — shown in the review. */
  rawSpecialty: string
}

export interface ImportResult {
  /** Only the fields the paste actually contained. */
  found: Partial<TeamInput>
  players: ImportedPlayer[]
  /** Field names present in TeamInput that this paste could not supply. */
  missing: string[]
  warnings: string[]
  /** True when neither block was recognised. */
  empty: boolean
  matchTitle?: string
  formation?: string
}

// --- specialties -----------------------------------------------------------

const SPECIALTY_BY_NAME: Record<string, Specialty> = {
  unpredictable: 'U',
  head: 'H',
  technical: 'T',
  quick: 'Q',
}

/** Slots that make a "Powerful" player a PNF or a PDIM respectively. */
const FORWARD_POSITIONS = new Set(['LFW', 'MFW', 'RFW'])
const INNER_MID_POSITIONS = new Set(['LIM', 'MIM', 'RIM'])

/**
 * Hattrick position codes, in the app's Left → Right slot order. Reversing the
 * game's own Right → Left ordering happens here, once, by construction.
 */
const LINE_SLOTS: Record<keyof SpecialtyGrid, (string | null)[]> = {
  fw: [null, 'LFW', 'MFW', 'RFW', null],
  mid: ['LW', 'LIM', 'MIM', 'RIM', 'RW'],
  def: ['LB', 'LCD', 'MCD', 'RCD', 'RB'],
  gk: [null, null, 'GK', null, null],
}

const emptyLine = (): Line => ['', '', '', '', '']

const emptyGrid = (): SpecialtyGrid => ({
  fw: emptyLine(),
  mid: emptyLine(),
  def: emptyLine(),
  gk: emptyLine(),
})

// --- tactics ---------------------------------------------------------------

/** Hattrick's wording -> the app's. Longest first so prefixes never shadow. */
const TACTIC_BY_NAME: [string, Tactic][] = [
  ['attack in the middle', 'Attack in Middle'],
  ['attack on wings', 'Attack on Wings'],
  ['counter-attacks', 'Counter Attacks'],
  ['counter attacks', 'Counter Attacks'],
  ['play creatively', 'Play Creatively'],
  ['long shots', 'Long Shots'],
  ['pressing', 'Pressing'],
  ['normal', '(no tactic)'],
]

/**
 * Levels each tactic's lookup tables actually hold. A value outside these is a
 * hard error in the engine, not a graceful degradation, so it is worth saying
 * so at import time rather than letting a red banner appear later.
 */
const TACTIC_LEVEL_DOMAIN: Partial<Record<Tactic, (n: number) => boolean>> = {
  Pressing: (n) => n === 0 || (n >= 2 && n <= 18),
  'Long Shots': (n) => n === 0 || (n >= 2 && n <= 29),
}

// --- helpers ---------------------------------------------------------------

/** Individual-order markers Hattrick prefixes to a name; the model has no field for them. */
const ORDER_MARKERS = /[▲▼▶◀↑↓→←]/g

const strip = (s: string) => s.replace(ORDER_MARKERS, '').trim()

const num = (s: string): number | null => {
  const v = Number(s.trim())
  return Number.isFinite(v) ? v : null
}

// --- ratings ---------------------------------------------------------------

/** Pull the cells out of a `[tr][th]Label[/th]…[/tr]` row. */
function ratingRow(text: string, label: string): number[] | null {
  const row = new RegExp(`\\[th\\]\\s*${label}\\s*\\[/th\\]((?:\\s*\\[td[^\\]]*\\][^\\[]*\\[/td\\])+)`, 'i')
  const m = text.match(row)
  if (!m) return null
  const cells = [...m[1].matchAll(/\[td[^\]]*\]([^[]*)\[\/td\]/g)].map((c) => num(c[1]))
  return cells.every((c) => c !== null) ? (cells as number[]) : null
}

export function parseRatings(text: string) {
  const out: Partial<TeamInput> = {}
  const warnings: string[] = []
  let matchTitle: string | undefined
  let formation: string | undefined
  let recognised = false

  const def = ratingRow(text, 'Defense') ?? ratingRow(text, 'Defence')
  if (def?.length === 3) {
    out.def = [def[2], def[1], def[0]] // Right, Centre, Left -> Left, Centre, Right
    recognised = true
  }

  const mid = ratingRow(text, 'Midfield')
  if (mid?.length === 1) {
    out.mid = mid[0]
    recognised = true
  }

  const att = ratingRow(text, 'Attack')
  if (att?.length === 3) {
    out.att = [att[2], att[1], att[0]]
    recognised = true
  }

  const title = text.match(/\[b\]([^[]+?)\[\/b\]\s*\[tournamentmatchid/i) ?? text.match(/\[b\]([^[]+?)\s+-\s+([^[]+?)\[\/b\]/)
  if (title) matchTitle = title[1].trim()

  const form = text.match(/\[b\]\s*Formation\s*\[\/b\]\s*:\s*([^\n[]+)/i)
  if (form) formation = form[1].trim()

  const tac = text.match(/\[b\]\s*Tactics?\s*\[\/b\]\s*:\s*([^\n[]+)/i)
  if (tac) {
    recognised = true
    const raw = tac[1].trim()
    const lower = raw.toLowerCase()
    const hit = TACTIC_BY_NAME.find(([name]) => lower.startsWith(name))
    // Hattrick appends the level as a word and a number: "… world class (13)".
    const lvl = raw.match(/\((\d+)\)\s*$/)

    if (!hit) {
      warnings.push(`Tactic "${raw}" was not recognised — set it by hand.`)
    } else {
      out.tactic = hit[1]
      if (hit[1] === '(no tactic)') {
        out.tacticLevel = 0
      } else if (lvl) {
        out.tacticLevel = Number(lvl[1])
      } else {
        // Fall back to the level word if the number is ever absent.
        const words = lower.slice(hit[0].length).trim()
        const idx = levelIndex(words)
        if (idx >= 0) out.tacticLevel = idx
        else warnings.push(`Could not read the tactic level from "${raw}".`)
      }

      const domain = TACTIC_LEVEL_DOMAIN[hit[1]]
      if (out.tacticLevel !== undefined && domain && !domain(out.tacticLevel)) {
        warnings.push(
          `${hit[1]} level ${out.tacticLevel} is outside the range the model has data for — ` +
            `it will report an error until you change it.`,
        )
      }
    }
  }

  return { found: out, warnings, matchTitle, formation, recognised }
}

// --- lineup ----------------------------------------------------------------

export function parseLineup(text: string) {
  const warnings: string[] = []
  const players: ImportedPlayer[] = []

  // The bench repeats names and specialties; only the first table is the XI.
  const xi = text.split(/Substitutes/i)[0]

  const cells = [...xi.matchAll(/\[b\]([A-Z]{2,3})\[\/b\]\s*([^[]*)(?:\[playerid=(\d+)\])?(?:\s*\[i\]([^[]*)\[\/i\])?/g)]
  if (cells.length === 0) return { found: {}, players, warnings, recognised: false }

  const byPosition = new Map<string, ImportedPlayer>()
  for (const c of cells) {
    const position = c[1].toUpperCase()
    const name = strip(c[2] ?? '')
    const rawSpecialty = (c[4] ?? '').trim()
    if (!name || name === '-') continue // an empty slot, not a player
    byPosition.set(position, { position, name, specialty: 'Z', rawSpecialty })
  }

  // The trailing table names the set-piece taker, which upgrades Head to H+SP.
  const sp = text.match(/\[th\]\s*Set Pieces\s*\[\/th\][\s\S]*?\[td[^\]]*\]([^[]*)/i)
  const setPieceTaker = sp ? strip(sp[1]) : ''

  const grid = emptyGrid()
  for (const [line, slots] of Object.entries(LINE_SLOTS) as [keyof SpecialtyGrid, (string | null)[]][]) {
    slots.forEach((position, i) => {
      if (!position) return
      const p = byPosition.get(position)
      if (!p) return // '' — genuinely nobody there, which is not the same as 'Z'

      let code: Specialty = 'Z'
      const key = p.rawSpecialty.toLowerCase()
      if (key === 'powerful') {
        if (FORWARD_POSITIONS.has(position)) code = 'PNF'
        else if (INNER_MID_POSITIONS.has(position)) code = 'PDIM'
        else {
          warnings.push(
            `${p.name} (${position}) is Powerful, which the model only represents for forwards ` +
              `and inner midfielders — recorded as no specialty.`,
          )
        }
      } else if (key && SPECIALTY_BY_NAME[key]) {
        code = SPECIALTY_BY_NAME[key]
      } else if (key) {
        warnings.push(`Specialty "${p.rawSpecialty}" (${p.name}) has no equivalent in the model.`)
      }

      if (code === 'H' && setPieceTaker && setPieceTaker === p.name) code = 'H+SP'

      p.specialty = code
      grid[line][i] = code
      players.push(p)
    })
  }

  return { found: { specialties: grid } as Partial<TeamInput>, players, warnings, recognised: true }
}

// --- combined --------------------------------------------------------------

/** Fields a Hattrick paste can never supply. */
const NEVER_IN_PASTE = ['ispDef', 'ispAtt', 'gkStars'] as const

export function parseHattrick(text: string): ImportResult {
  const r = parseRatings(text)
  const l = parseLineup(text)

  const found: Partial<TeamInput> = { ...r.found, ...l.found }
  const warnings = [...r.warnings, ...l.warnings]

  const missing: string[] = []
  if (!r.recognised) missing.push('ratings, tactic and tactic level')
  if (!l.recognised) missing.push('specialties')
  missing.push('set-piece ratings and keeper stars')

  return {
    found,
    players: l.players,
    missing,
    warnings,
    empty: !r.recognised && !l.recognised,
    matchTitle: r.matchTitle,
    formation: r.formation,
  }
}

/** Human-readable labels for the review step, in the app's own left-to-right terms. */
export function describeFound(found: Partial<TeamInput>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const sectors = ['L', 'C', 'R']
  if (found.att) found.att.forEach((v, i) => rows.push({ label: `Attack ${sectors[i]}`, value: String(v) }))
  if (found.mid !== undefined) rows.push({ label: 'Midfield', value: String(found.mid) })
  if (found.def) found.def.forEach((v, i) => rows.push({ label: `Defence ${sectors[i]}`, value: String(v) }))
  if (found.tactic) rows.push({ label: 'Tactic', value: found.tactic })
  if (found.tacticLevel !== undefined) rows.push({ label: 'Tactic level', value: String(found.tacticLevel) })
  return rows
}

export { NEVER_IN_PASTE, TACTICS }
