# NickOnline

A web version of **nickarana's Hattrick match simulator** (Simulator v5.1).

Enter both teams' ratings, set pieces, keeper, tactic and player specialties — or
paste your lineup straight out of Hattrick — and get the odds, expected goals,
the full goal distribution and the most likely scoreline.

**→ [How to use it](HOWTO.md)**

## What it is

- **A faithful port, not a reimplementation.** The engine reproduces the
  spreadsheet cell for cell. `tests/engine.golden.test.ts` asserts ~150
  intermediate values plus the headline numbers against the workbook's own
  cached results, to 1e-12.
- **Deterministic.** No Monte Carlo, no randomness. The same input always gives
  the same answer.
- **Static.** React + Vite + TypeScript, no backend, no database, no accounts.
  Everything runs in your browser and nothing you type leaves it.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/NickOnline/
npm test         # the parity suite
npm run build
```

## Credit

The model, the empirical lookup tables and the study data behind them are
**nickarana's** work — distilled from match studies over hundreds of thousands of
chances. This repository is a port of that workbook to the browser; the thinking
is his.

Hattrick is a trademark of its owners. This is an unofficial fan tool with no
affiliation.
