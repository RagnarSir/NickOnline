import type { Corrections, MatchInput, MatchResult } from '../../engine/types'
import { Breakdown, SectorTable } from './Breakdown'
import { GoalDistribution } from './GoalDistribution'
import { OutcomeBars } from './OutcomeBars'
import { ScorelineGrid } from './ScorelineGrid'
import { SpecialEventsTable } from './SpecialEventsTable'

export function Results({
  r,
  input,
  corrections,
  compare,
  compareName,
}: {
  r: MatchResult
  input: MatchInput
  corrections: Corrections
  compare?: MatchResult | null
  compareName?: string | null
}) {
  const nameA = input.teamA.name
  const nameB = input.teamB.name
  const errors = r.diagnostics.filter((d) => d.severity === 'error')
  const warnings = r.diagnostics.filter((d) => d.severity === 'warning')

  return (
    <>
      {errors.length > 0 && (
        <div className="diagnostics error">
          <strong>This matchup can't be evaluated as entered.</strong>
          <ul>
            {errors.map((d, i) => (
              <li key={i}>
                <code>{d.field}</code> — {d.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="diagnostics warning">
          <ul style={{ margin: 0 }}>
            {warnings.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Result</h2>
        <OutcomeBars r={r} nameA={nameA} nameB={nameB} afterPkFixed={corrections.afterPk} />
      </div>

      <div className="card">
        <h2>Key numbers</h2>
        <div className="tiles">
          <Tile k="Expected goals" a={r.teamA.xg} b={r.teamB.xg} d={2} nameA={nameA} nameB={nameB} compare={compare && [compare.teamA.xg, compare.teamB.xg]} />
          <Tile k="Expected points" a={r.teamA.xp} b={r.teamB.xp} d={2} nameA={nameA} nameB={nameB} compare={compare && [compare.teamA.xp, compare.teamB.xp]} />
          <Tile k="HTS" a={r.teamA.hts} b={r.teamB.hts} d={1} nameA={nameA} nameB={nameB} compare={compare && [compare.teamA.hts, compare.teamB.hts]} />
          <Tile
            k="HTS neutral"
            a={r.teamA.htsn}
            b={r.teamB.htsn}
            d={1}
            nameA={nameA}
            nameB={nameB}
            compare={compare && [compare.teamA.htsn, compare.teamB.htsn]}
          />
          <Tile
            k="Total chances"
            a={r.teamA.chances.total}
            b={r.teamB.chances.total}
            d={2}
            nameA={nameA}
            nameB={nameB}
            compare={compare && [compare.teamA.chances.total, compare.teamB.chances.total]}
          />
        </div>
        {compare && compareName && (
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Deltas are against <strong>{compareName}</strong>.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Goal distribution</h2>
        <GoalDistribution r={r} nameA={nameA} nameB={nameB} />
      </div>

      <div className="card">
        <h2>Scoreline probabilities</h2>
        <ScorelineGrid r={r} nameA={nameA} nameB={nameB} />
      </div>

      <div className="card">
        <h2>
          Where the goals come from
          <span className="hint">chances and expected goals by source</span>
        </h2>
        <Breakdown r={r} nameA={nameA} nameB={nameB} />
        <div style={{ marginTop: 12 }}>
          <SectorTable team={r.teamA} label={nameA} />
          <SectorTable team={r.teamB} label={nameB} />
          <SpecialEventsTable r={r} nameA={nameA} nameB={nameB} />
        </div>
      </div>
    </>
  )
}

function Tile({
  k,
  a,
  b,
  d,
  nameA,
  nameB,
  compare,
}: {
  k: string
  a: number
  b: number
  d: number
  nameA: string
  nameB: string
  compare?: [number, number] | null | false
}) {
  const delta = (now: number, then: number) => {
    const diff = now - then
    if (Math.abs(diff) < 10 ** -d / 2) return null
    return (
      <span style={{ color: diff > 0 ? 'var(--good)' : 'var(--critical)', fontSize: 12 }}>
        {diff > 0 ? '+' : ''}
        {diff.toFixed(d)}
      </span>
    )
  }

  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="tile-rows">
        <div className="tile-row">
          <span className="tile-team a">{nameA}</span>
          <span className="tile-val">{a.toFixed(d)}</span>
          {compare && <span className="tile-delta">{delta(a, compare[0])}</span>}
        </div>
        <div className="tile-row">
          <span className="tile-team b">{nameB}</span>
          <span className="tile-val">{b.toFixed(d)}</span>
          {compare && <span className="tile-delta">{delta(b, compare[1])}</span>}
        </div>
      </div>
    </div>
  )
}
