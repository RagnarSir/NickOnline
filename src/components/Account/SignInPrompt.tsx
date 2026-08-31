/**
 * Stands in for a library card while signed out. The card itself stays, so
 * signing in does not reflow the page out from under the reader.
 */
export function SignInPrompt({ what, onSignIn }: { what: string; onSignIn: () => void }) {
  return (
    <div className="signin-prompt">
      <p>
        Sign in to keep {what}. The calculator itself needs no account — everything
        above works signed out, and <strong>Copy link</strong> shares a matchup with
        anyone.
      </p>
      <button className="btn primary" onClick={onSignIn}>
        Sign in or create an account
      </button>
    </div>
  )
}
