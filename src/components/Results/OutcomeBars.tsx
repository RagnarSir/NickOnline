import type { MatchResult } from '../../engine/types'

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

interface Band {
  when: string
  winA: number
  middle: number
  winB: number
  middleLabel: string
  /** True when the middle band is the dead "after penalties" row, not a real draw. */
  unresolved?: boolean
}

export function OutcomeBars({
  r,
  nameA,
  nameB,
  afterPkFixed,
}: {
  r: MatchResult
  nameA: string
  nameB: string
  afterPkFixed: boolean
}) {
  const bands: Band[] = [
    {
      when: "After 90'",
      winA: r.regulation.winA,
      middle: r.regulation.draw,
      winB: r.regulation.winB,
      middleLabel: 'Draw',
    },
    {
      when: "After 120'",
      winA: r.afterExtraTime.winA,
      middle: r.afterExtraTime.draw,
      winB: r.afterExtraTime.winB,
      middleLabel: 'Draw',
    },
    {
      when: 'After penalties',
      winA: r.afterPenalties.winA,
      middle: Math.max(0, 1 - r.afterPenalties.winA - r.afterPenalties.winB),
      winB: r.afterPenalties.winB,
      middleLabel: afterPkFixed ? 'Draw' : 'Unresolved',
      unresolved: !afterPkFixed,
    },
  ]

  return (
    <div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--team-a)' }} /> {nameA} wins
        </span>
        <span>
          <i style={{ background: 'var(--draw)' }} /> Draw
        </span>
        <span>
          <i style={{ background: 'var(--team-b)' }} /> {nameB} wins
        </span>
      </div>

      {bands.map((b) => (
        <div className="outcome" key={b.when}>
          <div className="when">{b.when}</div>
          <div className="bar" role="img" aria-label={`${b.when}: ${nameA} ${pct(b.winA)}, ${b.middleLabel} ${pct(b.middle)}, ${nameB} ${pct(b.winB)}`}>
            <Segment value={b.winA} color="var(--team-a)" />
            <Segment
              value={b.middle}
              color="var(--draw)"
              striped={b.unresolved}
              title={b.unresolved ? 'v5.1 leaves this share unassigned' : undefined}
            />
            <Segment value={b.winB} color="var(--team-b)" />
          </div>
        </div>
      ))}

      {!afterPkFixed && (
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0 90px' }}>
          v5.1's penalty row reads two empty cells, so it repeats the 90' figures and leaves{' '}
          {pct(bands[2].middle)} unassigned. Turn on the <strong>After penalties</strong> correction to
          resolve it.
        </p>
      )}
    </div>
  )
}

function Segment({
  value,
  color,
  striped,
  title,
}: {
  value: number
  color: string
  striped?: boolean
  title?: string
}) {
  if (value <= 0) return null
  const wide = value > 0.07
  return (
    <div
      title={title}
      style={{
        flex: `${value} 1 0`,
        background: striped
          ? `repeating-linear-gradient(135deg, ${color}, ${color} 5px, transparent 5px, transparent 10px)`
          : color,
        border: striped ? '1px dashed var(--border-strong)' : undefined,
        color: striped ? 'var(--text-secondary)' : '#fff',
      }}
    >
      {wide ? `${(value * 100).toFixed(1)}%` : ''}
    </div>
  )
}
