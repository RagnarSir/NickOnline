import type { MatchResult } from '../../engine/types'

const n = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—')
const pc = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—')

export function SpecialEventsTable({ r, nameA, nameB }: { r: MatchResult; nameA: string; nameB: string }) {
  const total = (pick: (row: MatchResult['se'][number]) => number) =>
    r.se.reduce((s, row) => s + pick(row), 0)

  return (
    <details>
      <summary>Special events — all 14 event types</summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Spec</th>
              <th>{nameA} n</th>
              <th>{nameB} n</th>
              <th>{nameA} share</th>
              <th>{nameA} events</th>
              <th>{nameA} conv</th>
              <th>{nameA} goals</th>
              <th>{nameB} events</th>
              <th>{nameB} conv</th>
              <th>{nameB} goals</th>
            </tr>
          </thead>
          <tbody>
            {r.se.map((row) => (
              <tr key={row.event}>
                <td>{row.event}</td>
                <td className="muted">{row.specialty}</td>
                <td>{row.countA}</td>
                <td>{row.countB}</td>
                <td>{pc(row.share)}</td>
                <td>{n(row.freqA)}</td>
                <td>{pc(row.convA)}</td>
                <td>{n(row.goalsA)}</td>
                <td>{n(row.freqB)}</td>
                <td>{pc(row.convB)}</td>
                <td>{n(row.goalsB)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total</td>
              <td>{n(total((x) => x.freqA))}</td>
              <td />
              <td>{n(total((x) => x.goalsA))}</td>
              <td>{n(total((x) => x.freqB))}</td>
              <td />
              <td>{n(total((x) => x.goalsB))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Corner-to-head is split into two rows because each side's corners are a separate event.
        Play Creatively multiplies every frequency by {r.pcFactor.toFixed(3)}.
      </p>
    </details>
  )
}
