import { useMemo, useState } from 'react'
import { simulate } from '../../engine/simulate'
import type { Corrections, MatchInput } from '../../engine/types'
import { pairingInput, type SavedLineup } from '../../store/matchStore'

/**
 * Every Team A lineup played against every Team B lineup.
 *
 * Cells are coloured divergingly around an even match: blue means Team A is
 * favoured, orange means Team B is, grey means it is a coin toss. Hue carries
 * *who*, saturation carries *by how much* — and the number is always printed,
 * so colour is never the only channel.
 */

const BUCKETS = [
  { min: 0.2, cls: 'a3' },
  { min: 0.1, cls: 'a2' },
  { min: 0.03, cls: 'a1' },
  { min: -0.03, cls: 'z0' },
  { min: -0.1, cls: 'b1' },
  { min: -0.2, cls: 'b2' },
  { min: -1, cls: 'b3' },
]

const bucket = (winA: number) => BUCKETS.find((b) => winA - 0.5 > b.min)?.cls ?? 'b3'
const pct = (x: number) => `${(x * 100).toFixed(1)}`

export function LineupMatrix({
  lineups,
  input,
  corrections,
  onPick,
}: {
  lineups: SavedLineup[]
  input: MatchInput
  corrections: Corrections
  onPick: (a: SavedLineup, b: SavedLineup) => void
}) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)

  const rows = lineups.filter((l) => l.side === 'A')
  const cols = lineups.filter((l) => l.side === 'B')

  // Recomputed only when the libraries or the match-level settings change.
  const grid = useMemo(
    () =>
      rows.map((a) =>
        cols.map((b) => simulate(pairingInput(input, a.team, b.team), corrections).regulation),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, input.ratingsMode, input.specialtiesMode, input.extraTime, input.manmarking, corrections],
  )

  if (rows.length === 0 || cols.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Save at least one lineup for each side to see the matrix. Every combination is simulated,
        so you can pick the setup that holds up best across whatever they field.
      </p>
    )
  }

  // For each of their lineups, which of ours does best? That is the column max.
  const colBest = cols.map((_, j) => {
    let best = -1
    for (let i = 0; i < rows.length; i++) best = Math.max(best, grid[i][j].winA)
    return best
  })

  const summary = rows.map((_, i) => {
    const wins = grid[i].map((g) => g.winA)
    return {
      avg: wins.reduce((s, x) => s + x, 0) / wins.length,
      worst: Math.min(...wins),
    }
  })
  const bestAvg = Math.max(...summary.map((s) => s.avg))
  const bestWorst = Math.max(...summary.map((s) => s.worst))

  return (
    <div>
      <div className="matrix-legend">
        <span className="ml-scale" aria-hidden>
          <i className="a3" />
          <i className="a2" />
          <i className="a1" />
          <i className="z0" />
          <i className="b1" />
          <i className="b2" />
          <i className="b3" />
        </span>
        <span className="muted">
          {input.teamA.name} favoured &rarr; &nbsp;·&nbsp; even &nbsp;·&nbsp; &larr; {input.teamB.name} favoured
        </span>
      </div>

      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="corner">
                <span className="mx-rowhead">{input.teamA.name}</span>
                <span className="mx-colhead">v {input.teamB.name}</span>
              </th>
              {cols.map((b) => (
                <th key={b.id} className="mx-col">
                  {b.name}
                </th>
              ))}
              <th className="mx-sum">Average</th>
              <th className="mx-sum">Worst case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id}>
                <th className="mx-row">{a.name}</th>
                {cols.map((b, j) => {
                  const g = grid[i][j]
                  const isColBest = g.winA === colBest[j]
                  return (
                    <td
                      key={b.id}
                      className={`mx-cell ${bucket(g.winA)}${isColBest ? ' best' : ''}`}
                      onClick={() => onPick(a, b)}
                      onMouseMove={(e) =>
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          text: `${a.name} v ${b.name} — win ${pct(g.winA)}%, draw ${pct(g.draw)}%, loss ${pct(g.winB)}%`,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                      title="Load this pairing"
                    >
                      {pct(g.winA)}
                    </td>
                  )
                })}
                <td className={`mx-sum${summary[i].avg === bestAvg ? ' best' : ''}`}>
                  {pct(summary[i].avg)}
                </td>
                <td className={`mx-sum${summary[i].worst === bestWorst ? ' best' : ''}`}>
                  {pct(summary[i].worst)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Cells are {input.teamA.name}'s win probability after 90'. Outlined cells are the best
        answer to that column. <strong>Worst case</strong> is the safest pick if you can't predict
        their setup. Click any cell to load that pairing.
      </p>

      {hover && (
        <div className="viz-tooltip" style={{ left: hover.x + 12, top: hover.y - 30 }}>
          {hover.text}
        </div>
      )}
    </div>
  )
}
