import type { Line, Specialty, SpecialtyGrid as Grid } from '../../engine/types'

const BASE: Specialty[] = ['', 'Z', 'Q', 'H', 'H+SP', 'U', 'T']

const LABEL: Record<Specialty, string> = {
  '': '—',
  Z: 'Z',
  Q: 'Q',
  H: 'H',
  'H+SP': 'H+SP',
  U: 'U',
  T: 'T',
  PNF: 'PNF',
  PDIM: 'PDIM',
}

type RowKey = keyof Grid

const ROWS: { key: RowKey; label: string }[] = [
  { key: 'fw', label: 'FW' },
  { key: 'mid', label: 'MID' },
  { key: 'def', label: 'DEF' },
  { key: 'gk', label: 'GK' },
]

/** Which lateral slots a line actually uses, and what each may hold. */
function optionsFor(row: RowKey, i: number): Specialty[] | null {
  switch (row) {
    case 'fw':
      // Three forwards only; PNF is a forward specialty.
      return i >= 1 && i <= 3 ? [...BASE, 'PNF'] : null
    case 'mid':
      // Inner midfield may be PDIM; the wingers may not.
      return i >= 1 && i <= 3 ? [...BASE, 'PDIM'] : BASE
    case 'def':
      return BASE
    case 'gk':
      return i === 2 ? BASE : null
  }
}

export function SpecialtyGrid({
  grid,
  onChange,
}: {
  grid: Grid
  onChange: (row: RowKey, index: number, value: Specialty) => void
}) {
  return (
    <div className="spec-grid">
      <div />
      {['L', 'CL', 'C', 'CR', 'R'].map((h) => (
        <div key={h} className="rowlabel" style={{ textAlign: 'center' }}>
          {h}
        </div>
      ))}

      {ROWS.map(({ key, label }) => (
        <Row key={key} rowKey={key} label={label} line={grid[key]} onChange={onChange} />
      ))}
    </div>
  )
}

/** Expanded once, near the grids, rather than repeated in every cell's title. */
export function SpecialtyLegend() {
  const items = [
    ['Z', 'no specialty'],
    ['Q', 'Quick'],
    ['H', 'Head'],
    ['H+SP', 'Head, takes set pieces'],
    ['U', 'Unpredictable'],
    ['T', 'Technical'],
    ['PNF', 'Powerful (forwards)'],
    ['PDIM', 'Powerful (inner midfield)'],
  ]
  return (
    <dl className="spec-legend">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Row({
  rowKey,
  label,
  line,
  onChange,
}: {
  rowKey: RowKey
  label: string
  line: Line
  onChange: (row: RowKey, index: number, value: Specialty) => void
}) {
  return (
    <>
      <div className="rowlabel">{label}</div>
      {line.map((value, i) => {
        const options = optionsFor(rowKey, i)
        // An unused slot is nothing, not an empty control — draw it as a gap.
        if (!options) return <span key={i} className="spec-gap" aria-hidden />
        return (
          <select
            key={i}
            className={value ? 'filled' : ''}
            value={value}
            aria-label={`${label} slot ${i + 1}`}
            onChange={(e) => onChange(rowKey, i, e.target.value as Specialty)}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {LABEL[o]}
              </option>
            ))}
          </select>
        )
      })}
    </>
  )
}
