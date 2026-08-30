import type { MatchInput, MatchResult } from '../../engine/types'

/**
 * The live result, pinned to the top of the page.
 *
 * Managers talk about results, not probability vectors — so the headline is the
 * single most likely scoreline, with the odds underneath as the qualifier.
 */
export function Scoreboard({
  r,
  input,
  onRename,
}: {
  r: MatchResult
  input: MatchInput
  onRename: (side: 'A' | 'B', name: string) => void
}) {
  let best = { i: 0, j: 0, p: -1 }
  for (let i = 0; i < r.scoreline.length; i++)
    for (let j = 0; j < r.scoreline[i].length; j++)
      if (r.scoreline[i][j] > best.p) best = { i, j, p: r.scoreline[i][j] }

  const { winA, draw, winB } = r.regulation
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`

  return (
    <div className="scoreboard">
      <div className="sb-main">
        <TeamName side="A" value={input.teamA.name} onRename={onRename} align="right" />

        <div className="sb-score">
          <span className="sb-goals">{best.i}</span>
          <span className="sb-dash">–</span>
          <span className="sb-goals">{best.j}</span>
        </div>

        <TeamName side="B" value={input.teamB.name} onRename={onRename} align="left" />
      </div>

      <div className="sb-meta">
        <span className="sb-xg a">{r.teamA.xg.toFixed(2)} xG</span>
        <span className="sb-likely">most likely scoreline · {pct(best.p)}</span>
        <span className="sb-xg b">{r.teamB.xg.toFixed(2)} xG</span>
      </div>

      <div
        className="sb-odds"
        role="img"
        aria-label={`${input.teamA.name} ${pct(winA)}, draw ${pct(draw)}, ${input.teamB.name} ${pct(winB)}`}
      >
        <div className="a" style={{ flex: winA }}>
          <span>{pct(winA)}</span>
        </div>
        <div className="d" style={{ flex: draw }}>
          <span>{pct(draw)}</span>
        </div>
        <div className="b" style={{ flex: winB }}>
          <span>{pct(winB)}</span>
        </div>
      </div>
    </div>
  )
}

function TeamName({
  side,
  value,
  onRename,
  align,
}: {
  side: 'A' | 'B'
  value: string
  onRename: (side: 'A' | 'B', name: string) => void
  align: 'left' | 'right'
}) {
  return (
    <input
      className={`sb-name ${side === 'A' ? 'a' : 'b'}`}
      style={{ textAlign: align }}
      value={value}
      spellCheck={false}
      aria-label={`Team ${side} name`}
      onChange={(e) => onRename(side, e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  )
}
