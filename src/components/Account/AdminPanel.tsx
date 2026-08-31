import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'

/**
 * Group and user management, for admins.
 *
 * Sign-up here is open, so the gate that actually matters is *group membership*:
 * a stranger who registers gets their own private library and can see nothing.
 * Membership is handed out as a join code rather than by picking a username off
 * this list — with open sign-up, `ragnar77` and `ragnar_77` may not be the same
 * person, and a misclick would put an opponent inside a group.
 */

interface AdminUser {
  id: string
  username: string
  role: 'user' | 'admin'
  disabled: boolean
  createdAt: number
  group: { id: string; name: string }
}

interface AdminGroup {
  id: string
  name: string
  joinCode: string | null
  joinUses: number
  joinMax: number | null
}

export function AdminPanel({ onToast }: { onToast: (m: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ users: AdminUser[]; groups: AdminGroup[] }>('/admin/users')
      setUsers(data.users)
      setGroups(data.groups)
    } catch {
      setError('Could not load the admin data.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const call = async (path: string, body?: unknown) => {
    try {
      await api(path, { method: 'POST', body })
      await refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
      return false
    }
  }

  return (
    <div className="account-block admin-block">
      <h3>Groups and people</h3>
      {error && <p className="account-error">{error}</p>}

      <div className="account-row">
        <input
          value={name}
          placeholder="New group name"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={async () => {
            if (await call('/admin/groups', { name })) {
              setName('')
              onToast('Group created — hand its join code to the members')
            }
          }}
        >
          Create group
        </button>
      </div>

      {groups.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Join code</th>
              <th>Used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td className="mono">
                  {g.joinCode ?? <span className="muted">revoked</span>}
                </td>
                <td className="mono">{g.joinUses}{g.joinMax != null && ` / ${g.joinMax}`}</td>
                <td className="admin-actions">
                  {g.joinCode && (
                    <button
                      className="btn ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(g.joinCode!)
                        onToast('Join code copied')
                      }}
                    >
                      Copy
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => call(`/admin/groups/${g.id}/code`)}>
                    New code
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => call(`/admin/groups/${g.id}/code`, { revoke: true })}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Group</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.disabled ? 'is-disabled' : undefined}>
              <td>
                {u.username}
                {u.disabled && <span className="tag">disabled</span>}
              </td>
              <td>{u.group.name}</td>
              <td>{u.role}</td>
              <td className="admin-actions">
                <button
                  className="btn ghost"
                  onClick={() =>
                    call(`/admin/users/${u.id}/role`, {
                      role: u.role === 'admin' ? 'user' : 'admin',
                    })
                  }
                >
                  {u.role === 'admin' ? 'Make user' : 'Make admin'}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => call(`/admin/users/${u.id}/disabled`, { disabled: !u.disabled })}
                >
                  {u.disabled ? 'Enable' : 'Disable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="account-note">
        Admins cannot move someone into a group from here, and that is deliberate:
        the join code proves you handed access to the person you meant.
      </p>
    </div>
  )
}
