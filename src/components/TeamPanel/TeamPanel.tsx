import { TACTICS, LOCATIONS } from '../../engine/types'
import type { Specialty, SpecialtyGrid as Grid, TeamInput, Tactic, Location } from '../../engine/types'
import { T } from '../../engine/tables'
import { SpecialtyGrid } from './SpecialtyGrid'

const GK_STARS = T.convKstars.gkStars

/** Tactics with no level of their own — the level input is meaningless for them. */
const LEVELLESS: Tactic[] = ['(no tactic)']

interface Props {
  accent: string
  team: TeamInput
  /** Percent mode hides ratings from the pitch, but HTS still reads them. */
  percentMode: boolean
  /** Field names a Hattrick import could not supply, highlighted until filled. */
  needsAttention?: string[]
  onAttended?: (field: string) => void
  onChange: (fn: (t: TeamInput) => void) => void
}

const Num = ({
  label,
  value,
  step = 0.25,
  min,
  hint,
  attention,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  hint?: string
  attention?: boolean
  onChange: (v: number) => void
}) => (
  <div className={`field${attention ? ' needs-attention' : ''}`}>
    <label>{label}</label>
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
    {hint && <span className="field-hint">{hint}</span>}
  </div>
)

export function TeamPanel({ accent, team, percentMode, needsAttention, onAttended, onChange }: Props) {
  const wants = (field: string) => needsAttention?.includes(field) ?? false
  const attended = (field: string) => onAttended?.(field)
  const setSpec = (row: keyof Grid, index: number, value: Specialty) =>
    onChange((t) => {
      t.specialties[row][index] = value
    })

  const levelless = LEVELLESS.includes(team.tactic)

  return (
    <div className="card team" style={{ ['--accent' as string]: accent }}>
      <h3 className="team-heading">
        <span className="swatch" />
        {team.name}
      </h3>

      {percentMode && (
        <details className="ratings-fallback">
          <summary>Attack &amp; defence ratings</summary>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            Sector percentages replace these for chance conversion, but the HTS score and the
            counter-attack model still read them.
          </p>
          <div className="grid-3">
            <Num label="Att L" value={team.att[0]} onChange={(v) => onChange((t) => void (t.att[0] = v))} />
            <Num label="Att C" value={team.att[1]} onChange={(v) => onChange((t) => void (t.att[1] = v))} />
            <Num label="Att R" value={team.att[2]} onChange={(v) => onChange((t) => void (t.att[2] = v))} />
          </div>
          <div className="grid-3" style={{ marginTop: 8 }}>
            <Num label="Def L" value={team.def[0]} onChange={(v) => onChange((t) => void (t.def[0] = v))} />
            <Num label="Def C" value={team.def[1]} onChange={(v) => onChange((t) => void (t.def[1] = v))} />
            <Num label="Def R" value={team.def[2]} onChange={(v) => onChange((t) => void (t.def[2] = v))} />
          </div>
        </details>
      )}

      <div className={`section-label${percentMode ? '' : ' first'}`}>Set pieces &amp; keeper</div>
      <div className="grid-3">
        <Num
          label="Defence"
          value={team.ispDef}
          attention={wants('ispDef')}
          onChange={(v) => {
            attended('ispDef')
            onChange((t) => void (t.ispDef = v))
          }}
        />
        <Num
          label="Attack"
          value={team.ispAtt}
          attention={wants('ispAtt')}
          onChange={(v) => {
            attended('ispAtt')
            onChange((t) => void (t.ispAtt = v))
          }}
        />
        <div className={`field${wants('gkStars') ? ' needs-attention' : ''}`}>
          <label>Keeper stars</label>
          <select
            value={team.gkStars}
            onChange={(e) => {
              attended('gkStars')
              onChange((t) => void (t.gkStars = Number(e.target.value)))
            }}
          >
            {GK_STARS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-label">Tactic</div>
      <div className="grid-3">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Playing</label>
          <select
            value={team.tactic}
            onChange={(e) => onChange((t) => void (t.tactic = e.target.value as Tactic))}
          >
            {TACTICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Skill</label>
          <input
            type="number"
            value={levelless ? '' : team.tacticLevel}
            step={1}
            min={0}
            disabled={levelless}
            placeholder="—"
            onChange={(e) =>
              onChange((t) => void (t.tacticLevel = e.target.value === '' ? 0 : Number(e.target.value)))
            }
          />
        </div>
      </div>

      <div className="section-label">
        Specialties
        <span className="section-note">by line and position</span>
      </div>
      <SpecialtyGrid grid={team.specialties} onChange={setSpec} />

      <div className="section-label">
        Ground
        <span className="section-note">neutral HTS only — never the odds</span>
      </div>
      <div className="field">
        <select
          value={team.location}
          onChange={(e) => onChange((t) => void (t.location = e.target.value as Location))}
        >
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
