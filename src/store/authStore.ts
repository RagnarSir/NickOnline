/** Who is signed in, and which group they act in. */

import { create } from 'zustand'
import { api, ApiError } from '../api/client'

export interface Me {
  id: string
  username: string
  role: 'user' | 'admin'
  group: { id: string; name: string; kind: 'personal' | 'shared' }
}

/**
 * 'unknown' is the initial value, not 'anon'. Without it the toolbar would show
 * "Sign in" for the length of the /auth/me round-trip and then swap — a flash
 * that reads as being logged out.
 */
export type AuthStatus = 'unknown' | 'anon' | 'user'

interface AuthState {
  status: AuthStatus
  me: Me | null
  busy: boolean
  error: string | null
  bootstrap: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  signup: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  joinGroup: (code: string) => Promise<boolean>
  leaveGroup: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<boolean>
  markAnon: () => void
  clearError: () => void
}

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong.'

/** React 18 StrictMode double-invokes effects in dev; share the in-flight call. */
let inFlight: Promise<void> | null = null

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  me: null,
  busy: false,
  error: null,

  bootstrap: () => {
    if (inFlight) return inFlight
    inFlight = api<{ user: Me | null }>('/auth/me')
      .then(({ user }) => set({ me: user, status: user ? 'user' : 'anon' }))
      .catch(() => set({ me: null, status: 'anon' }))
      .finally(() => {
        inFlight = null
      })
    return inFlight
  },

  login: async (username, password) => {
    set({ busy: true, error: null })
    try {
      const { user } = await api<{ user: Me }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      set({ me: user, status: 'user', busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: message(e) })
      return false
    }
  },

  signup: async (username, password) => {
    set({ busy: true, error: null })
    try {
      const { user } = await api<{ user: Me }>('/auth/signup', {
        method: 'POST',
        body: { username, password },
      })
      set({ me: user, status: 'user', busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: message(e) })
      return false
    }
  },

  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      /* the session is going away locally either way */
    }
    set({ me: null, status: 'anon', error: null })
  },

  joinGroup: async (code) => {
    set({ busy: true, error: null })
    try {
      const { user } = await api<{ user: Me }>('/groups/join', {
        method: 'POST',
        body: { code },
      })
      set({ me: user, busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: message(e) })
      return false
    }
  },

  leaveGroup: async () => {
    try {
      const { user } = await api<{ user: Me }>('/groups/leave', { method: 'POST' })
      set({ me: user })
    } catch (e) {
      set({ error: message(e) })
    }
  },

  changePassword: async (current, next) => {
    set({ busy: true, error: null })
    try {
      await api('/auth/password', { method: 'POST', body: { current, next } })
      set({ busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: message(e) })
      return false
    }
  },

  markAnon: () => set({ me: null, status: 'anon' }),
  clearError: () => set({ error: null }),
}))
