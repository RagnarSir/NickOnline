import { useAuth } from '../../store/authStore'

/**
 * The toolbar's identity chip. Shows the group, not just the name — which group
 * you are in decides who can see what you save, so it belongs on screen at all
 * times rather than behind a click.
 */
export function AccountButton({ onClick }: { onClick: () => void }) {
  const { status, me } = useAuth()

  if (status === 'unknown') {
    return (
      <button className="btn" disabled>
        …
      </button>
    )
  }

  if (status === 'anon') {
    return (
      <button className="btn" onClick={onClick}>
        Sign in
      </button>
    )
  }

  return (
    <button className="btn account-chip" onClick={onClick} title="Account and group">
      <span className="account-name">{me!.username}</span>
      <span className="account-sep">·</span>
      <span className={`account-group ${me!.group.kind}`}>
        {me!.group.kind === 'personal' ? 'just you' : me!.group.name}
      </span>
    </button>
  )
}
