import type { Corrections } from '../../engine/types'

const ITEMS: { key: keyof Corrections; title: string; detail: string }[] = [
  {
    key: 'afterPk',
    title: 'After penalties',
    detail:
      "v5.1 builds the penalty row from two empty cells, so it just repeats the 90' figures and never uses the shootout odds it already computed. The fix resolves extra-time draws through the shootout.",
  },
  {
    key: 'teamBCounterAttacks',
    title: "Team B's counter-attacks",
    detail:
      "Team A gains counter-attacks from the opponent's missed Unpredictable events; Team B's formula omits that term. The fix mirrors Team A. Only bites when Team A has Unpredictable players.",
  },
  {
    key: 'teamBHtsWeights',
    title: "Team B's HTS attack weights",
    detail:
      "Team B's attack aggregate is built with Team A's tactic weights. The workbook computes Team B's own weights but never uses them. Affects the HTS figure only, not the odds.",
  },
  {
    key: 'aimCentreWeight',
    title: 'Attack in Middle weight',
    detail:
      'With Attack in Middle the centre slot takes the 0.25 side weight instead of 0.50, so the weights sum to 0.75 and HTS attack is understated. Affects the HTS figure only.',
  },
  {
    key: 'percentLinearise',
    title: 'Percent mode: linearise counter-attacks',
    detail:
      'v5.1 fixed corners to derive possession from the entered percentage, but the counter-attack gate and the extreme-CA midfield test still read the Ratings cells. The fix applies the same inversion to both.',
  },
]

export function CorrectionsPanel({
  corrections,
  onChange,
  percentMode,
}: {
  corrections: Corrections
  onChange: (key: keyof Corrections, value: boolean) => void
  percentMode: boolean
}) {
  const on = ITEMS.filter((i) => corrections[i.key]).length

  return (
    <details className="card">
      <summary style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
        Model corrections{' '}
        <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
          {on === 0 ? '— off, matching v5.1 exactly' : `— ${on} of ${ITEMS.length} enabled`}
        </span>
      </summary>

      <p className="muted" style={{ fontSize: 12.5 }}>
        Four defects found while porting the workbook, plus one deliberate extension. All are off by
        default so results match the spreadsheet cell for cell.
      </p>

      {ITEMS.map((item) => {
        const irrelevant = item.key === 'percentLinearise' && !percentMode
        return (
          <label className="correction" key={item.key} style={{ opacity: irrelevant ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={corrections[item.key]}
              onChange={(e) => onChange(item.key, e.target.checked)}
            />
            <span>
              <span className="t">{item.title}</span>
              {irrelevant && <span className="muted"> — Percent mode only</span>}
              <div className="d">{item.detail}</div>
            </span>
          </label>
        )
      })}
    </details>
  )
}
