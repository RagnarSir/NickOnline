import { useMemo, useState } from 'react'
import { simulate } from '../../engine/simulate'
import type { SavedMatchup } from '../../store/matchStore'

type Key = 'name' | 'savedBy' | 'winA' | 'draw' | 'winB' | 'xgA' | 'xgB' | 'htsA' | 'htsB'

const COLUMNS: { key: Key; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Matchup', numeric: false },
  // On a shared shelf a row may be a colleague's, so say whose it is.
  { key: 'savedBy', label: 'Saved by', numeric: false },
  { key: 'winA', label: 'Win', numeric: true },
  { key: 'draw', label: 'Draw', numeric: true },
  { key: 'winB', label: 'Loss', numeric: true },
  { key: 'xgA', label: 'xG for', numeric: true },
  { key: 'xgB', label: 'xG against', numeric: true },
  { key: 'htsA', label: 'HTS for', numeric: true },
  { key: 'htsB', label: 'HTS against', numeric: true },
]

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

/**
 * Every saved matchup on one screen. Columns are from Team A's point of view,
 * since that is the side you are usually choosing for.
 */
export function ScenarioTable({
  saved,
  compareWith,
  onLoad,
  onCompare,
  onRemove,
}: {
  saved: SavedMatchup[]
  compareWith: string | null
  onLoad: (m: SavedMatchup) => void
  onCompare: (name: string | null) => void
  onRemove: (name: string) => void
}) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'winA', desc: true })

  const rows = useMemo(() => {
    const evaluated = saved.map((m) => {
      const r = simulate(m.input, m.corrections)
      return {
        m,
        name: m.name,
        savedBy: m.savedBy,
        winA: r.regulation.winA,
        draw: r.regulation.draw,
        winB: r.regulation.winB,
        xgA: r.teamA.xg,
        xgB: r.teamB.xg,
        htsA: r.teamA.hts,
        htsB: r.teamB.hts,
      }
    })
    const { key, desc } = sort
    return evaluated.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return desc ? -cmp : cmp
    })
  }, [saved, sort])

  if (saved.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        No saved matchups yet. Use <strong>Save</strong> in the header to keep the current one, then
        they all appear here side by side.
      </p>
    )
  }

  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }))

  return (
    <div className="table-wrap">
      <table className="scenarios">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key)}
                className="sortable"
                aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
              >
                {c.label}
                <span className="sort-mark">{sort.key === c.key ? (sort.desc ? '▾' : '▴') : ''}</span>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.m.id}>
              <td>
                <span className="load" onClick={() => onLoad(row.m)} title="Load this matchup">
                  {row.name}
                </span>
              </td>
              <td className="byline">{row.savedBy}</td>
              <td>{pct(row.winA)}</td>
              <td>{pct(row.draw)}</td>
              <td>{pct(row.winB)}</td>
              <td>{row.xgA.toFixed(2)}</td>
              <td>{row.xgB.toFixed(2)}</td>
              <td>{row.htsA.toFixed(0)}</td>
              <td>{row.htsB.toFixed(0)}</td>
              <td className="row-actions">
                <button
                  title={compareWith === row.name ? 'Stop comparing' : 'Show deltas against this'}
                  onClick={() => onCompare(compareWith === row.name ? null : row.name)}
                  style={{ color: compareWith === row.name ? 'var(--team-a)' : undefined }}
                >
                  ±
                </button>
                <button title="Delete" onClick={() => onRemove(row.name)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
