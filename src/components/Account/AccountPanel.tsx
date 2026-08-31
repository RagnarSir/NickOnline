import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { legacyCounts, wasImported } from '../../migrate/localLibrary'
import { useAuth } from '../../store/authStore'
import { useStore } from '../../store/matchStore'
import { AdminPanel } from './AdminPanel'

type Tab = 'in' | 'up'

export function AccountPanel({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { status, me, busy, error, login, signup, logout, joinGroup, leaveGroup, changePassword, clearError } = useAuth()

  if (status === 'user') {
    return (
      <SignedIn
        onClose={onClose}
        onToast={onToast}
        me={me!}
        busy={busy}
        error={error}
        logout={logout}
        joinGroup={joinGroup}
        leaveGroup={leaveGroup}
        changePassword={changePassword}
        clearError={clearError}
      />
    )
  }

  return (
    <SignedOut
      onClose={onClose}
      busy={busy}
      error={error}
      login={login}
      signup={signup}
      clearError={clearError}
    />
  )
}

function SignedOut({
  onClose, busy, error, login, signup, clearError,
}: {
  onClose: () => void
  busy: boolean
  error: string | null
  login: (u: string, p: string) => Promise<boolean>
  signup: (u: string, p: string) => Promise<boolean>
  clearError: () => void
}) {
  const [tab, setTab] = useState<Tab>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = tab === 'in' ? await login(username, password) : await signup(username, password)
    if (ok) onClose()
  }

  return (
    <section className="card account-panel">
      <div className="account-head">
        <h2>{tab === 'in' ? 'Sign in' : 'Create an account'}</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>

      <div className="segmented">
        <button aria-pressed={tab === 'in'} onClick={() => { setTab('in'); clearError() }}>
          I have an account
        </button>
        <button aria-pressed={tab === 'up'} onClick={() => { setTab('up'); clearError() }}>
          New account
        </button>
      </div>

      <form className="account-form" onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="account-error">{error}</p>}
        <button className="btn primary" disabled={busy || !username || !password}>
          {tab === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="account-note">
        A new account starts private to you. To share a library with team-mates, ask
        whoever runs this instance for a <strong>join code</strong> and enter it once
        you are signed in.
      </p>
    </section>
  )
}

function SignedIn({
  onClose, onToast, me, busy, error, logout, joinGroup, leaveGroup, changePassword, clearError,
}: {
  onClose: () => void
  onToast: (m: string) => void
  me: NonNullable<ReturnType<typeof useAuth.getState>['me']>
  busy: boolean
  error: string | null
  logout: () => Promise<void>
  joinGroup: (code: string) => Promise<boolean>
  leaveGroup: () => Promise<void>
  changePassword: (c: string, n: string) => Promise<boolean>
  clearError: () => void
}) {
  const { importLocal, importPersonal } = useStore()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<{ matchups: number; lineups: number } | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const local = wasImported() ? { matchups: 0, lineups: 0 } : legacyCounts()
  const hasLocal = local.matchups + local.lineups > 0
  const shared = me.group.kind === 'shared'

  useEffect(() => {
    let live = true
    api<{ matchups: number; lineups: number }>('/personal/pending')
      .then((p) => live && setPending(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [me.group.id])

  const hasPending = (pending?.matchups ?? 0) + (pending?.lineups ?? 0) > 0

  const doImportLocal = async () => {
    const r = await importLocal()
    onToast(
      r.skipped.length
        ? `Added ${r.added}. Skipped ${r.skipped.length} already here.`
        : `Added ${r.added} from this browser.`,
    )
  }

  const doImportPersonal = async () => {
    const r = await importPersonal()
    onToast(
      r.skipped.length
        ? `Copied ${r.added}. Skipped ${r.skipped.length} whose names were taken.`
        : `Copied ${r.added} into ${me.group.name}.`,
    )
    setPending({ matchups: 0, lineups: 0 })
  }

  return (
    <section className="card account-panel">
      <div className="account-head">
        <h2>Account</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>

      <dl className="account-facts">
        <dt>Signed in as</dt>
        <dd>{me.username}{me.role === 'admin' && <span className="tag">admin</span>}</dd>
        <dt>Group</dt>
        <dd>
          {shared ? me.group.name : 'Just you'}
          <span className="account-hint">
            {shared
              ? 'Everyone in this group sees and can edit everything saved here.'
              : 'Nothing you save is visible to anyone else.'}
          </span>
        </dd>
      </dl>

      {error && <p className="account-error">{error}</p>}

      {!shared && (
        <div className="account-block">
          <h3>Join a group</h3>
          <p>
            A join code comes from whoever runs this instance. Entering one moves you
            into that group's shared library.
          </p>
          <div className="account-row">
            <input
              value={code}
              placeholder="ABCD-2345"
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="btn primary"
              disabled={busy || !code.trim()}
              onClick={async () => {
                if (await joinGroup(code)) {
                  onToast('Joined')
                  setCode('')
                }
              }}
            >
              Join
            </button>
          </div>
        </div>
      )}

      {shared && (
        <div className="account-block">
          <h3>Leave {me.group.name}</h3>
          <p>
            Your own library comes back exactly as you left it. Anything saved into
            the group stays with the group.
          </p>
          <button className="btn" onClick={async () => { await leaveGroup(); onToast('Back to your own library') }}>
            Leave the group
          </button>
        </div>
      )}

      {hasPending && (
        <div className="account-block account-offer">
          <h3>Copy your own work into {me.group.name}?</h3>
          <p>
            You have <strong>{pending!.matchups} matchups</strong> and{' '}
            <strong>{pending!.lineups} lineups</strong> saved privately. Copying them
            here makes them visible to everyone in the group. The originals stay in
            your own library either way.
          </p>
          <button className="btn primary" onClick={doImportPersonal}>
            Copy them into {me.group.name}
          </button>
        </div>
      )}

      {hasLocal && (
        <div className="account-block account-offer">
          <h3>This browser has older saved work</h3>
          <p>
            <strong>{local.matchups} matchups</strong> and{' '}
            <strong>{local.lineups} lineups</strong> were saved here before accounts
            existed. Adding them puts them in{' '}
            {shared ? <strong>{me.group.name}</strong> : 'your own library'}
            {shared && ', where your team-mates will see them'}. Nothing is deleted
            from this browser.
          </p>
          <button className="btn primary" onClick={doImportLocal}>
            Add them
          </button>
        </div>
      )}

      <div className="account-block">
        <h3>Password</h3>
        {showPw ? (
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await changePassword(current, next)) {
                onToast('Password changed — other devices are signed out')
                setShowPw(false)
                setCurrent('')
                setNext('')
              }
            }}
          >
            <label>
              Current password
              <input type="password" value={current} autoComplete="current-password"
                     onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label>
              New password
              <input type="password" value={next} autoComplete="new-password"
                     onChange={(e) => setNext(e.target.value)} />
            </label>
            <div className="account-row">
              <button className="btn primary" disabled={busy}>Change password</button>
              <button type="button" className="btn ghost"
                      onClick={() => { setShowPw(false); clearError() }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" onClick={() => setShowPw(true)}>Change password</button>
        )}
      </div>

      {me.role === 'admin' && <AdminPanel onToast={onToast} />}

      <div className="account-block">
        <button className="btn" onClick={async () => { await logout(); onToast('Signed out'); onClose() }}>
          Sign out
        </button>
      </div>
    </section>
  )
}
