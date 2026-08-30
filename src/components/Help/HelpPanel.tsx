import guide from '../../help/guide.json'

/**
 * Renders src/help/guide.json — the single source for both this panel and the
 * generated HOWTO.md. Edit the JSON, never this file, to change the wording.
 */

type Block =
  | { type: 'p'; text: string }
  | { type: 'note'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }

interface Section {
  id: string
  heading: string
  blocks: Block[]
}

/**
 * Minimal inline formatting: **bold**, *italic* and `code`. The bold alternative
 * is listed first so it wins over the single-asterisk one.
 */
function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={`${key}-${i}`}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>
    return <span key={`${key}-${i}`}>{part}</span>
  })
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const sections = guide.sections as Section[]

  return (
    <div className="card help">
      <div className="help-head">
        <h2>{guide.title}</h2>
        <button className="btn small" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="help-intro">{inline(guide.intro, 'intro')}</p>

      <nav className="help-toc">
        {sections.map((s) => (
          <a key={s.id} href={`#help-${s.id}`}>
            {s.heading}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={`help-${s.id}`} className="help-section">
          <h3>{s.heading}</h3>
          {s.blocks.map((b, i) => (
            <BlockView key={i} block={b} k={`${s.id}-${i}`} />
          ))}
        </section>
      ))}

      <p className="muted help-footer">{guide.footer}</p>
    </div>
  )
}

function BlockView({ block, k }: { block: Block; k: string }) {
  switch (block.type) {
    case 'p':
      return <p>{inline(block.text, k)}</p>
    case 'note':
      return <p className="help-note">{inline(block.text, k)}</p>
    case 'steps':
      return (
        <ol className="help-steps">
          {block.items.map((t, i) => (
            <li key={i}>{inline(t, `${k}-${i}`)}</li>
          ))}
        </ol>
      )
    case 'list':
      return (
        <ul className="help-list">
          {block.items.map((t, i) => (
            <li key={i}>{inline(t, `${k}-${i}`)}</li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className="table-wrap">
          <table className="help-table">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{inline(cell, `${k}-${i}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}
