import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, setUnauthorizedHandler } from '../src/api/client'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthorizedHandler(() => {})
})

describe('api client', () => {
  it('sends the CSRF header on every call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/library')
    await api('/matchups', { method: 'PUT', body: { name: 'x' } })

    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers['X-NickOnline']).toBe('1')
      expect(call[1].credentials).toBe('same-origin')
    }
  })

  it('calls the unauthorized handler exactly once and does not retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'nope' }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauth = vi.fn()
    setUnauthorizedHandler(onUnauth)

    await expect(api('/library')).rejects.toBeInstanceOf(ApiError)

    expect(onUnauth).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a network failure as offline, not "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/library')).rejects.toMatchObject({ status: 0, code: 'offline' })
  })

  it('carries the conflict detail through so the user can be told who holds the name', async () => {
    const existing = { name: 'Cup final', savedBy: 'mikael', savedAt: 1 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(409, { error: 'conflict', existing }),
    ))
    await expect(api('/matchups', { method: 'PUT' })).rejects.toMatchObject({
      status: 409,
      detail: existing,
    })
  })
})
