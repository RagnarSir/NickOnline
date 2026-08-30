import type { MatchResult, TeamResult } from '../../engine/types'

const n3 = (x: number) => x.toFixed(3)
const n4 = (x: number) => x.toFixed(4)
const pc = (x: number) => `${(x * 100).toFixed(1)}%`

const SOURCES = [
  { key: 'lcr', label: 'Left / Center / Right' },
  { key: 'setPiece', label: 'Set pieces' },
  { key: 'ls', label: 'Long shots' },
  { key: 'ca', label: 'Counter-attacks' },
  { key: 'pnf', label: 'Powerful forward' },
  { key: 'se', label: 'Special events' },
] as const

/** Chances and goals by source — the spreadsheet's P11:R24 block. */
export function Breakdown({ r, nameA, nameB }: { r: MatchResult; nameA: string; nameB: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>{nameA} chances</th>
            <th>{nameA} goals</th>
            <th>{nameB} chances</th>
            <th>{nameB} goals</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{n3(r.teamA.chances[s.key])}</td>
              <td>{n3(r.teamA.goals[s.key])}</td>
              <td>{n3(r.teamB.chances[s.key])}</td>
              <td>{n3(r.teamB.goals[s.key])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{n3(r.teamA.chances.total)}</td>
            <td>{n3(r.teamA.goals.total)}</td>
            <td>{n3(r.teamB.chances.total)}</td>
            <td>{n3(r.teamB.goals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** The per-sector table for one side — the spreadsheet's V7:AA15 / AB7:AG15. */
export function SectorTable({ team, label }: { team: TeamResult; label: string }) {
  return (
    <details>
      <summary>{label} — chance detail</summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th>% of chances</th>
              <th>Conversion</th>
              <th>Chances</th>
              <th>Goals</th>
              <th>CA chances</th>
              <th>CA goals</th>
            </tr>
          </thead>
          <tbody>
            {team.sectors.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{pc(s.dist)}</td>
                <td>{pc(s.conv)}</td>
                <td>{n3(s.chances)}</td>
                <td>{n4(s.goals)}</td>
                <td>{n3(s.caChances)}</td>
                <td>{n4(s.caGoals)}</td>
              </tr>
            ))}
            <tr>
              <td>Powerful forward</td>
              <td className="muted">—</td>
              <td>{pc(0.8)}</td>
              <td>{n3(team.pnfChances)}</td>
              <td>{n4(team.pnfGoals)}</td>
              <td className="muted">—</td>
              <td className="muted">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="tiles" style={{ marginTop: 12 }}>
        <Stat k="Possession" v={pc(team.possession)} />
        <Stat k="After pressing" v={n3(team.chancesAfterPress)} />
        <Stat k="After possession" v={n3(team.chancesAfterPoss)} />
        <Stat k="After opp. PDIM" v={n3(team.chancesAfterPdim)} />
        <Stat k="Counter-attack rate" v={pc(team.caPct)} />
        <Stat k="Counter-attacks" v={n3(team.counterAttacks)} />
        <Stat k="Long shots pressed" v={pc(team.pressLsPct)} />
        <Stat k="HTSN" v={team.htsn.toFixed(1)} />
      </div>
    </details>
  )
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="tile">
    <div className="k">{k}</div>
    <div className="v" style={{ fontSize: 17 }}>
      {v}
    </div>
  </div>
)
