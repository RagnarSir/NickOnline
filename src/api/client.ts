/**
 * The one place that talks to the API.
 *
 * The base path is derived from Vite's `base`, so it follows the single place
 * the sub-path is configured rather than being a second constant that can drift
 * from `vite.config.ts`, the nginx location and the session cookie's Path.
 */

const BASE = `${import.meta.env.BASE_URL}api`

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

/**
 * Called when the server says the session is gone. Unlike RagCheat, this never
 * redirects to a login page: the calculator is public, so losing a session must
 * leave you calculating, not staring at a sign-in wall.
 */
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // A cross-site HTML form cannot set a custom header, so requiring one
        // is a free CSRF defence on top of the cookie's SameSite=Lax.
        'X-NickOnline': '1',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    })
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the server.")
  }

  if (res.status === 401) {
    onUnauthorized()
    throw new ApiError(401, 'unauthorized', 'Please sign in again.')
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null)

  if (!res.ok) {
    const payload = data as { error?: string; existing?: unknown } | null
    throw new ApiError(
      res.status,
      payload?.error ?? 'error',
      payload?.error ?? `Request failed (${res.status})`,
      payload?.existing,
    )
  }
  return data as T
}
