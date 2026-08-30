/** Encode the whole match state into the URL hash so a matchup can be linked. */

import type { Corrections, MatchInput } from './engine/types'

export interface SharedState {
  input: MatchInput
  corrections: Corrections
}

const toBase64Url = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (s: string): string => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeState(state: SharedState): string {
  return toBase64Url(JSON.stringify(state))
}

export function decodeState(hash: string): SharedState | null {
  const raw = hash.replace(/^#/, '').replace(/^m=/, '')
  if (!raw) return null
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as SharedState
    if (!parsed?.input?.teamA || !parsed?.input?.teamB) return null
    return parsed
  } catch {
    return null
  }
}

export function shareUrl(state: SharedState): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#m=${encodeState(state)}`
}
