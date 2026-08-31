import type { MatchInput } from '../../engine/types'
import type { SavedLineup } from '../../store/matchStore'

/** Two shelves of saved team setups — one per side — feeding the matrix below. */
export function LineupLibrary({
  lineups,
  input,
  onSave,
  onApply,
  onRemove,
}: {
  lineups: SavedLineup[]
  input: MatchInput
  onSave: (side: 'A' | 'B') => void
  onApply: (l: SavedLineup) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="lineup-shelves">
      <Shelf
        side="A"
        teamName={input.teamA.name}
        accent="var(--team-a)"
        lineups={lineups.filter((l) => l.side === 'A')}
        onSave={onSave}
        onApply={onApply}
        onRemove={onRemove}
      />
      <Shelf
        side="B"
        teamName={input.teamB.name}
        accent="var(--team-b)"
        lineups={lineups.filter((l) => l.side === 'B')}
        onSave={onSave}
        onApply={onApply}
        onRemove={onRemove}
      />
    </div>
  )
}

function Shelf({
  side,
  teamName,
  accent,
  lineups,
  onSave,
  onApply,
  onRemove,
}: {
  side: 'A' | 'B'
  teamName: string
  accent: string
  lineups: SavedLineup[]
  onSave: (side: 'A' | 'B') => void
  onApply: (l: SavedLineup) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="shelf" style={{ ['--accent' as string]: accent }}>
      <div className="shelf-head">
        <span className="swatch" />
        <span className="shelf-name">{teamName}</span>
        <button className="btn small" onClick={() => onSave(side)}>
          Save current setup
        </button>
      </div>

      {lineups.length === 0 ? (
        <p className="muted shelf-empty">
          No saved setups yet. Adjust {teamName}'s ratings, tactic and specialties, then save them
          here to try against the other side's options.
        </p>
      ) : (
        <div className="saved-list">
          {lineups.map((l) => (
            <span className="chip" key={l.id}>
              <span className="load" onClick={() => onApply(l)} title={`Load into ${teamName}`}>
                {l.name}
              </span>
              <span className="byline" title={`Saved by ${l.savedBy}`}>{l.savedBy}</span>
              <button title="Delete" onClick={() => onRemove(l.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
