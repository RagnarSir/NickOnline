import { useMemo, useState } from 'react'
import { describeFound, parseHattrick } from '../../import/parseHattrick'
import { ratingName } from '../../lib/ratingNames'
import type { TeamInput } from '../../engine/types'
import { SpecialtyGrid } from '../TeamPanel/SpecialtyGrid'

/**
 * Paste Hattrick's BBCode, see what it found, then apply it.
 *
 * The review step exists because Hattrick orders sectors right-to-left and this
 * app orders them left-to-right. Every value is shown under the app's own label,
 * so a mirroring mistake is visible here rather than hiding inside a plausible
 * looking result.
 */
export function ImportPanel({
  teamName,
  onApply,
  onClose,
}: {
  teamName: string
  onApply: (found: Partial<TeamInput>, attention: string[]) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const result = useMemo(() => (text.trim() ? parseHattrick(text) : null), [text])

  const rows = result ? describeFound(result.found) : []

  return (
    <div className="card import">
      <div className="help-head">
        <h2>Import from Hattrick</h2>
        <button className="btn small" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        In Hattrick, copy your ratings and your lineup — they are two separate copies. Paste
        either or both here; they can go in together, in any order.
      </p>

      <textarea
        className="import-box"
        value={text}
        spellCheck={false}
        placeholder="Paste here…"
        aria-label="Hattrick ratings or lineup text"
        onChange={(e) => setText(e.target.value)}
      />

      {result && result.empty && (
        <div className="diagnostics error" style={{ marginTop: 12, marginBottom: 0 }}>
          <strong>That doesn't look like Hattrick's ratings or lineup text.</strong> Nothing has
          been changed. Use the copy buttons on the Hattrick lineup page rather than selecting the
          page by hand.
        </div>
      )}

      {result && !result.empty && (
        <>
          <div className="import-grid">
            <div>
              <div className="section-label first">Ratings and tactic</div>
              {rows.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  No ratings in this paste — the lineup copy on its own carries only specialties.
                </p>
              ) : (
                <table className="import-table">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <th>{r.label}</th>
                        <td>{r.value}</td>
                        <td className="muted">
                          {/^(Attack|Defence|Midfield)/.test(r.label)
                            ? (ratingName(Number(r.value))?.full ?? '')
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div className="section-label first">
                Specialties
                <span className="section-note">as they will land, left to right</span>
              </div>
              {result.found.specialties ? (
                <SpecialtyGrid grid={result.found.specialties} onChange={() => {}} />
              ) : (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  No lineup in this paste — the specialty grid will be left as it is.
                </p>
              )}
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="diagnostics warning" style={{ marginTop: 14, marginBottom: 0 }}>
              <ul style={{ margin: 0 }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="muted import-missing">
            Not in this paste, so it will be left alone: {result.missing.join('; ')}.
          </p>

          <div className="import-actions">
            <button
              className="btn primary"
              onClick={() => onApply(result.found, ['ispDef', 'ispAtt', 'gkStars'])}
            >
              Apply to {teamName}
            </button>
            <button className="btn" onClick={() => setText('')}>
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}
