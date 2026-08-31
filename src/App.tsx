import { useEffect, useMemo, useState } from 'react'
import { AccountButton } from './components/Account/AccountButton'
import { AccountPanel } from './components/Account/AccountPanel'
import { SignInPrompt } from './components/Account/SignInPrompt'
import { CorrectionsPanel } from './components/Corrections/CorrectionsPanel'
import { HelpPanel } from './components/Help/HelpPanel'
import { ImportPanel } from './components/Import/ImportPanel'
import { LineupLibrary } from './components/Lineups/LineupLibrary'
import { LineupMatrix } from './components/Lineups/LineupMatrix'
import { ScenarioTable } from './components/Scenarios/ScenarioTable'
import { PitchPanel } from './components/Pitch/PitchPanel'
import { Results } from './components/Results/Results'
import { Scoreboard } from './components/Scoreboard/Scoreboard'
import { SpecialtyLegend } from './components/TeamPanel/SpecialtyGrid'
import { TeamPanel } from './components/TeamPanel/TeamPanel'
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle'
import { simulate } from './engine/simulate'
import type { MatchInput } from './engine/types'
import { setUnauthorizedHandler } from './api/client'
import { decodeState, shareUrl } from './share'
import { useAuth } from './store/authStore'
import { defaultInput, exampleInput, useStore } from './store/matchStore'

export default function App() {
  const { input, corrections, saved, lineups, compareWith, needsAttention } = useStore()
  const { setInput, replaceInput, setCorrection, save, remove, setCompareWith } = useStore()
  const { saveLineup, removeLineup, applyLineup, applyPairing } = useStore()
  const { applyImport, clearAttention } = useStore()
  const { loadLibrary, clearLibrary, clearConflict } = useStore()
  const { status, me, bootstrap, markAnon } = useAuth()
  const [toast, setToast] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(() => window.location.hash === '#help')
  const [showImport, setShowImport] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const signedIn = status === 'user'

  // A shared link fully describes a matchup; load it once on mount.
  useEffect(() => {
    const shared = decodeState(window.location.hash)
    if (shared) {
      replaceInput(shared.input, shared.corrections)
      setToast('Loaded matchup from link')
    }
  }, [replaceInput])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // Who am I? Answered once, before the library is asked for.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // A session that ends server-side must not leave another group's rows on
  // screen, so drop the shelf as well as the identity.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      markAnon()
      clearLibrary()
      setToast('Signed out — sign in again to reach your library')
    })
  }, [markAnon, clearLibrary])

  // Keyed on the group as well as the status: an admin can move someone between
  // groups mid-session, and the shelf has to follow without a re-login.
  useEffect(() => {
    if (signedIn) void loadLibrary()
    else clearLibrary()
  }, [signedIn, me?.group.id, loadLibrary, clearLibrary])

  const result = useMemo(() => simulate(input, corrections), [input, corrections])

  const comparison = useMemo(() => {
    const m = saved.find((s) => s.name === compareWith)
    return m ? { name: m.name, result: simulate(m.input, m.corrections) } : null
  }, [saved, compareWith])

  const percentMode = input.ratingsMode === 'Percent'

  const onShare = async () => {
    const url = shareUrl({ input, corrections })
    window.history.replaceState(null, '', url)
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Link is in the address bar — copy it from there')
    }
  }

  const onSave = async () => {
    if (!signedIn) {
      setShowAccount(true)
      setToast('Sign in to save a matchup')
      return
    }
    const suggested = `${input.teamA.name} v ${input.teamB.name}`
    const name = window.prompt('Name this matchup', suggested)?.trim()
    if (!name) return

    let outcome = await save(name)
    if (outcome === 'conflict') {
      // On a shared shelf that name may be a colleague's work, so replacing it
      // is a decision rather than a side effect.
      const held = useStore.getState().conflict
      const when = held ? new Date(held.savedAt).toLocaleString() : ''
      clearConflict()
      const ok = window.confirm(
        `“${name}” was saved by ${held?.savedBy ?? 'someone'} on ${when}.\n\nReplace it?`,
      )
      if (!ok) return
      outcome = await save(name, true)
    }
    setToast(outcome === 'ok' ? `Saved “${name}”` : useStore.getState().libraryError ?? 'Could not save')
  }

  const onSaveLineup = async (side: 'A' | 'B') => {
    const team = side === 'A' ? input.teamA : input.teamB
    const name = window.prompt(`Name this ${team.name} setup`, describeLineup(team))?.trim()
    if (!name) return

    let outcome = await saveLineup(side, name)
    if (outcome === 'conflict') {
      const held = useStore.getState().conflict
      clearConflict()
      if (!window.confirm(`“${name}” was saved by ${held?.savedBy ?? 'someone'}.\n\nReplace it?`)) return
      outcome = await saveLineup(side, name, true)
    }
    setToast(outcome === 'ok' ? `Saved “${name}”` : useStore.getState().libraryError ?? 'Could not save')
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>NickOnline</h1>
          <div className="sub">
            Hattrick match simulator · nickarana model v5.1
            {Object.values(corrections).some(Boolean) && ' · corrected'}
          </div>
        </div>

        <div className="toolbar">
          <button className="btn" aria-pressed={showHelp} onClick={() => setShowHelp((v) => !v)}>
            How to use
          </button>
          <button className="btn" aria-pressed={showImport} onClick={() => setShowImport((v) => !v)}>
            Import from Hattrick
          </button>
          <button className="btn" onClick={() => replaceInput(exampleInput())}>
            Load example
          </button>
          <button className="btn" onClick={() => replaceInput(defaultInput())}>
            Start over
          </button>
          <button className="btn" onClick={onSave}>
            Save
          </button>
          <button className="btn primary" onClick={onShare}>
            Copy link
          </button>
          <AccountButton onClick={() => setShowAccount((v) => !v)} />
          <ThemeToggle />
        </div>
      </header>

      {showAccount && (
        <AccountPanel onClose={() => setShowAccount(false)} onToast={setToast} />
      )}

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

      {showImport && (
        <ImportPanel
          teamName={input.teamA.name}
          onClose={() => setShowImport(false)}
          onApply={(found, attention) => {
            applyImport(found, attention)
            setShowImport(false)
            setToast(`Imported into ${input.teamA.name} — set pieces and keeper still needed`)
          }}
        />
      )}

      <Scoreboard
        r={result}
        input={input}
        onRename={(side, name) =>
          setInput((d) => void ((side === 'A' ? d.teamA : d.teamB).name = name))
        }
      />

      <div className="modes">
        <span className="mode-label">Enter ratings as</span>
        <div className="segmented" role="group" aria-label="Ratings input mode">
          {(['Ratings', 'Percent'] as const).map((m) => (
            <button
              key={m}
              aria-pressed={input.ratingsMode === m}
              onClick={() => setInput((d) => void (d.ratingsMode = m))}
            >
              {m === 'Ratings' ? 'Match ratings' : 'Sector percentages'}
            </button>
          ))}
        </div>

        <span className="mode-label">Specialties</span>
        <div className="segmented" role="group" aria-label="Specialties">
          {(['Yes', 'No'] as const).map((m) => (
            <button
              key={m}
              aria-pressed={input.specialtiesMode === m}
              onClick={() => setInput((d) => void (d.specialtiesMode = m))}
            >
              {m === 'Yes' ? 'Entered' : 'Estimated'}
            </button>
          ))}
        </div>
      </div>

      <PitchPanel
        input={input}
        onChangeA={(fn) => setInput((d) => fn(d.teamA))}
        onChangeB={(fn) => setInput((d) => fn(d.teamB))}
      />

      <div className="teams">
        <TeamPanel
          accent="var(--team-a)"
          team={input.teamA}
          percentMode={percentMode}
          needsAttention={needsAttention}
          onAttended={clearAttention}
          onChange={(fn) => setInput((d) => fn(d.teamA))}
        />
        <TeamPanel
          accent="var(--team-b)"
          team={input.teamB}
          percentMode={percentMode}
          onChange={(fn) => setInput((d) => fn(d.teamB))}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Specialty codes
          <span className="hint">used by both grids above</span>
        </h2>
        <SpecialtyLegend />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Cup rules
          <span className="hint">extra time and man-marking adjust the neutral HTS figure</span>
        </h2>
        <div className="grid-4">
          <div className="field">
            <label>Extra time</label>
            <select
              value={input.extraTime}
              onChange={(e) => setInput((d) => void (d.extraTime = e.target.value as 'N' | 'Y'))}
            >
              <option value="N">No</option>
              <option value="Y">Yes</option>
            </select>
          </div>
          <div className="field">
            <label>Teams man-marking</label>
            <select
              value={input.manmarking}
              onChange={(e) => setInput((d) => void (d.manmarking = Number(e.target.value) as 0 | 1 | 2))}
            >
              <option value={0}>Neither</option>
              <option value={1}>One</option>
              <option value={2}>Both</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <CorrectionsPanel corrections={corrections} onChange={setCorrection} percentMode={percentMode} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Results
          r={result}
          input={input}
          corrections={corrections}
          compare={comparison?.result}
          compareName={comparison?.name}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Lineup library
          <span className="hint">save each side's options, then sweep them against each other</span>
        </h2>
        {signedIn ? (
          <LineupLibrary
            lineups={lineups}
            input={input}
            onSave={onSaveLineup}
            onApply={(l) => {
              applyLineup(l)
              setToast(`Loaded “${l.name}”`)
            }}
            onRemove={removeLineup}
          />
        ) : (
          <SignInPrompt what="a shelf of lineups" onSignIn={() => setShowAccount(true)} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Every lineup against every lineup
          <span className="hint">{input.teamA.name}'s win probability in each pairing</span>
        </h2>
        {signedIn ? (
          <LineupMatrix
            lineups={lineups}
            input={input}
            corrections={corrections}
            onPick={(a, b) => {
              applyPairing(a, b)
              setToast(`Loaded ${a.name} v ${b.name}`)
            }}
          />
        ) : (
          <SignInPrompt what="lineups to sweep against each other" onSignIn={() => setShowAccount(true)} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Saved matchups
          <span className="hint">click a name to load · ± shows deltas on the key numbers</span>
        </h2>
        {signedIn ? (
          <ScenarioTable
            saved={saved}
            compareWith={compareWith}
            onLoad={(m) => replaceInput(m.input, m.corrections)}
            onCompare={setCompareWith}
            onRemove={remove}
          />
        ) : (
          <SignInPrompt what="saved matchups" onSignIn={() => setShowAccount(true)} />
        )}
      </div>

      <footer className="muted" style={{ fontSize: 12, marginTop: 28, textAlign: 'center' }}>
        Model and lookup tables by nickarana · Simulator v5.1, last revised 26 Oct 2025
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/** A sensible default name: the tactic is what usually distinguishes two setups. */
function describeLineup(team: { tactic: string; tacticLevel: number }): string {
  return team.tactic === '(no tactic)' ? 'No tactic' : `${team.tactic} ${team.tacticLevel}`
}

export type { MatchInput }
