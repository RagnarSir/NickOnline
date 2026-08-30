import { ratingName } from '../../lib/ratingNames'
import type { MatchInput, TeamInput } from '../../engine/types'

/**
 * Ratings entered as the duels the model actually computes.
 *
 * Every sector conversion is own-attack against the *mirrored* opposing defence
 * — a left attack meets a right defence. Laying the inputs out as two attacking
 * halves, each sector sitting directly above the defender it faces, makes that
 * mechanic visible instead of leaving it buried in the formulas.
 */

const SECTORS = ['Left', 'Centre', 'Right'] as const
/** Attack sector i is met by defence sector 2 - i. */
const FACES = [2, 1, 0]

/** Rough visual range for the strength bars — most match ratings land inside it. */
const BAR_MIN = 4
const BAR_MAX = 20
const barPct = (v: number) =>
  Math.max(0, Math.min(100, ((v - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100))

interface Props {
  input: MatchInput
  onChangeA: (fn: (t: TeamInput) => void) => void
  onChangeB: (fn: (t: TeamInput) => void) => void
}

export function PitchPanel({ input, onChangeA, onChangeB }: Props) {
  const { teamA: a, teamB: b, ratingsMode } = input
  const percent = ratingsMode === 'Percent'

  return (
    <section className="pitch">
      <Half
        attacker={a}
        defender={b}
        attackerAccent="var(--team-a)"
        defenderAccent="var(--team-b)"
        percent={percent}
        onAttack={(i, v) => onChangeA((t) => void (percent ? (t.percentConv[i] = v) : (t.att[i] = v)))}
        onDefend={(i, v) => onChangeB((t) => void (t.def[i] = v))}
      />

      <Midfield input={input} onChangeA={onChangeA} onChangeB={onChangeB} />

      <Half
        attacker={b}
        defender={a}
        attackerAccent="var(--team-b)"
        defenderAccent="var(--team-a)"
        percent={percent}
        onAttack={(i, v) => onChangeB((t) => void (percent ? (t.percentConv[i] = v) : (t.att[i] = v)))}
        onDefend={(i, v) => onChangeA((t) => void (t.def[i] = v))}
      />
    </section>
  )
}

function Half({
  attacker,
  defender,
  attackerAccent,
  defenderAccent,
  percent,
  onAttack,
  onDefend,
}: {
  attacker: TeamInput
  defender: TeamInput
  attackerAccent: string
  defenderAccent: string
  percent: boolean
  onAttack: (i: number, v: number) => void
  onDefend: (i: number, v: number) => void
}) {
  return (
    <div className="half" style={{ ['--atk' as string]: attackerAccent, ['--def' as string]: defenderAccent }}>
      <div className="half-head">
        <span className="half-team">{attacker.name}</span>
        <span className="half-verb">{percent ? 'sector conversion' : 'attacking'}</span>
        <span className="half-rule" />
      </div>

      <div className="duels">
        {SECTORS.map((sector, i) => (
          <div className="duel" key={sector}>
            <div className="duel-sector">{sector}</div>

            <Cell
              value={percent ? attacker.percentConv[i] : attacker.att[i]}
              accent="var(--atk)"
              percent={percent}
              onChange={(v) => onAttack(i, v)}
            />

            {!percent && (
              <>
                <div className="duel-vs">
                  <span>v</span>
                </div>
                <Cell
                  value={defender.def[FACES[i]]}
                  accent="var(--def)"
                  label={`${defender.name} ${SECTORS[FACES[i]].toLowerCase()} defence`}
                  onChange={(v) => onDefend(FACES[i], v)}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Cell({
  value,
  accent,
  label,
  percent,
  onChange,
}: {
  value: number
  accent: string
  label?: string
  percent?: boolean
  onChange: (v: number) => void
}) {
  const named = percent ? null : ratingName(value)
  return (
    <div className="cell">
      <input
        type="number"
        value={value}
        step={percent ? 0.01 : 0.25}
        min={0}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      {percent ? (
        <div className="cell-name">{(value * 100).toFixed(0)}% converted</div>
      ) : (
        <>
          <div className="cell-bar" aria-hidden>
            <i style={{ width: `${barPct(value)}%`, background: accent }} />
          </div>
          <div className="cell-name">{named?.full ?? '—'}</div>
        </>
      )}
      {label && <div className="cell-owner">{label}</div>}
    </div>
  )
}

function Midfield({
  input,
  onChangeA,
  onChangeB,
}: {
  input: MatchInput
  onChangeA: (fn: (t: TeamInput) => void) => void
  onChangeB: (fn: (t: TeamInput) => void) => void
}) {
  const { teamA: a, teamB: b } = input
  const percent = input.ratingsMode === 'Percent'
  // Possession is cubic on midfield levels, so a small edge compounds.
  const la = a.mid * 4 - 3
  const lb = b.mid * 4 - 3
  const share = percent ? a.possession : la ** 3 / (la ** 3 + lb ** 3)

  return (
    <div className="midfield">
      <div className="mf-side">
        <label>{a.name} midfield</label>
        <input
          type="number"
          step={0.25}
          min={0}
          value={a.mid}
          onChange={(e) => onChangeA((t) => void (t.mid = Number(e.target.value) || 0))}
        />
        <span className="mf-name">{ratingName(a.mid)?.full ?? '—'}</span>
      </div>

      <div className="mf-bar">
        <div className="mf-label">
          {percent ? 'Possession (entered)' : 'Possession'}
        </div>
        <div className="mf-track">
          <div className="mf-fill a" style={{ width: `${share * 100}%` }}>
            <span>{(share * 100).toFixed(0)}%</span>
          </div>
          <div className="mf-fill b" style={{ width: `${(1 - share) * 100}%` }}>
            <span>{((1 - share) * 100).toFixed(0)}%</span>
          </div>
        </div>
        {percent && (
          <input
            className="mf-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={a.possession}
            aria-label="Possession share"
            onChange={(e) => onChangeA((t) => void (t.possession = Number(e.target.value)))}
          />
        )}
      </div>

      <div className="mf-side right">
        <label>{b.name} midfield</label>
        <input
          type="number"
          step={0.25}
          min={0}
          value={b.mid}
          onChange={(e) => onChangeB((t) => void (t.mid = Number(e.target.value) || 0))}
        />
        <span className="mf-name">{ratingName(b.mid)?.full ?? '—'}</span>
      </div>
    </div>
  )
}
