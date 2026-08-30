import { useState } from 'react'
import type { MatchResult } from '../../engine/types'

const W = 640
const H = 220
const PAD = { top: 12, right: 8, bottom: 28, left: 40 }

interface Hover {
  x: number
  y: number
  text: string
}

/** Grouped bars: how likely each side is to score exactly k goals. */
export function GoalDistribution({ r, nameA, nameB }: { r: MatchResult; nameA: string; nameB: string }) {
  const [hover, setHover] = useState<Hover | null>(null)

  const a = r.teamA.goalDist
  const b = r.teamB.goalDist

  // Trim the long tail: keep bars while either side still has a visible chance.
  let last = 5
  for (let k = 0; k < a.length; k++) if (a[k] >= 0.005 || b[k] >= 0.005) last = k
  const ks = Array.from({ length: last + 1 }, (_, k) => k)

  const max = Math.max(...ks.map((k) => Math.max(a[k], b[k])), 0.05)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / ks.length
  const barW = Math.min(18, (band - 6) / 2)

  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]

  return (
    <div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--team-a)' }} /> {nameA}
        </span>
        <span>
          <i style={{ background: 'var(--team-b)' }} /> {nameB}
        </span>
      </div>

      <div className="table-wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Goal distribution by team">
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {(t * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {ks.map((k) => {
            const cx = PAD.left + band * k + band / 2
            const label = k === 10 ? '10+' : String(k)
            return (
              <g key={k}>
                <Bar
                  x={cx - barW - 1}
                  w={barW}
                  v={a[k]}
                  y={y}
                  base={PAD.top + plotH}
                  color="var(--team-a)"
                  onEnter={(e) =>
                    setHover({ x: e.clientX, y: e.clientY, text: `${nameA} scores ${label}: ${(a[k] * 100).toFixed(2)}%` })
                  }
                  onLeave={() => setHover(null)}
                />
                <Bar
                  x={cx + 1}
                  w={barW}
                  v={b[k]}
                  y={y}
                  base={PAD.top + plotH}
                  color="var(--team-b)"
                  onEnter={(e) =>
                    setHover({ x: e.clientX, y: e.clientY, text: `${nameB} scores ${label}: ${(b[k] * 100).toFixed(2)}%` })
                  }
                  onLeave={() => setHover(null)}
                />
                <text x={cx} y={H - 9} textAnchor="middle" fontSize={11.5} fill="var(--text-muted)">
                  {label}
                </text>
              </g>
            )
          })}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        </svg>
      </div>

      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        Goals scored
      </div>

      {hover && (
        <div className="viz-tooltip" style={{ left: hover.x + 12, top: hover.y - 30 }}>
          {hover.text}
        </div>
      )}
    </div>
  )
}

function Bar({
  x,
  w,
  v,
  y,
  base,
  color,
  onEnter,
  onLeave,
}: {
  x: number
  w: number
  v: number
  y: (v: number) => number
  base: number
  color: string
  onEnter: (e: React.MouseEvent) => void
  onLeave: () => void
}) {
  const top = y(v)
  const h = Math.max(0, base - top)
  return (
    <>
      {/* Invisible hit target spanning the full plot height, so short bars are still easy to hit. */}
      <rect
        x={x - 2}
        y={0}
        width={w + 4}
        height={base}
        fill="transparent"
        onMouseEnter={onEnter}
        onMouseMove={onEnter}
        onMouseLeave={onLeave}
      />
      <rect x={x} y={top} width={w} height={h} rx={h > 4 ? 3 : 0} fill={color} pointerEvents="none" />
    </>
  )
}
