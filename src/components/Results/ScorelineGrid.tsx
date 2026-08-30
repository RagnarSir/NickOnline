import { useState } from 'react'
import type { MatchResult } from '../../engine/types'

const N = 6 // show 0-5 goals per side; the tail is negligible

/**
 * Ramp step names rather than colours: the ramp runs light-to-dark in light mode
 * and dark-to-light in dark mode, so the matching ink has to come from CSS too.
 */
const STEPS = [100, 250, 400, 550, 700] as const

/** Heatmap of P(A scores i, B scores j) — magnitude, so one hue light to dark. */
export function ScorelineGrid({ r, nameA, nameB }: { r: MatchResult; nameA: string; nameB: string }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)

  const cells: { i: number; j: number; p: number }[] = []
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push({ i, j, p: r.scoreline[i][j] })

  const max = Math.max(...cells.map((c) => c.p))
  const best = cells.reduce((a, b) => (b.p > a.p ? b : a))

  const step = (p: number) => {
    if (max <= 0) return STEPS[0]
    return STEPS[Math.min(STEPS.length - 1, Math.floor((p / max) * STEPS.length))]
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Most likely scoreline: <strong style={{ color: 'var(--text-primary)' }}>{best.i}–{best.j}</strong> at{' '}
        {(best.p * 100).toFixed(1)}%
      </p>

      <div className="table-wrap">
        <table style={{ width: 'auto' }}>
          <thead>
            <tr>
              <th style={{ color: 'var(--team-a)' }}>{nameA} \ {nameB}</th>
              {Array.from({ length: N }, (_, j) => (
                <th key={j} style={{ textAlign: 'center', color: 'var(--team-b)' }}>
                  {j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: N }, (_, i) => (
              <tr key={i}>
                <th style={{ color: 'var(--team-a)' }}>{i}</th>
                {Array.from({ length: N }, (_, j) => {
                  const p = r.scoreline[i][j]
                  const isBest = i === best.i && j === best.j
                  const s = step(p)
                  return (
                    <td
                      key={j}
                      style={{
                        background: `var(--seq-${s})`,
                        textAlign: 'center',
                        color: `var(--on-seq-${s})`,
                        fontWeight: isBest ? 700 : 400,
                        outline: isBest ? '2px solid var(--text-primary)' : undefined,
                        outlineOffset: '-2px',
                        borderBottom: '2px solid var(--surface)',
                        borderRight: '2px solid var(--surface)',
                        cursor: 'default',
                      }}
                      onMouseMove={(e) =>
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          text: `${i}–${j}: ${(p * 100).toFixed(2)}%`,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      {(p * 100).toFixed(1)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        Values are percentages. Rows are {nameA} goals, columns {nameB}.
      </p>

      {hover && (
        <div className="viz-tooltip" style={{ left: hover.x + 12, top: hover.y - 30 }}>
          {hover.text}
        </div>
      )}
    </div>
  )
}
