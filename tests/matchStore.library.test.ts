/**
 * The store's library half, exercised against a stubbed fetch. Zustand works
 * outside React, so this needs no renderer and no jsdom — the repo keeps its
 * default node environment and its lack of a vitest config.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, type SavedLineup, type SavedMatchup } from '../src/store/matchStore'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const matchup = (over: Partial<SavedMatchup> = {}): SavedMatchup => ({
  id: 'm1',
  name: 'Cup final',
  savedAt: 100,
  savedBy: 'alice',
  input: useStore.getState().input,
  corrections: useStore.getState().corrections,
  ...over,
})

const lineup = (over: Partial<SavedLineup> = {}): SavedLineup => ({
  id: 'l1',
  name: '4-4-2',
  side: 'A',
  savedAt: 100,
  savedBy: 'alice',
  team: useStore.getState().input.teamA,
  ...over,
})

beforeEach(() => {
  useStore.getState().clearLibrary()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('library state', () => {
  it('starts empty — nothing is read at module scope any more', () => {
    expect(useStore.getState().saved).toEqual([])
    expect(useStore.getState().lineups).toEqual([])
    expect(useStore.getState().library).toBe('idle')
  })

  it('loadLibrary fills both shelves, newest first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {
      matchups: [matchup({ id: 'a', savedAt: 1 }), matchup({ id: 'b', savedAt: 9 })],
      lineups: [lineup()],
    })))

    await useStore.getState().loadLibrary()

    const s = useStore.getState()
    expect(s.library).toBe('ready')
    expect(s.saved.map((m) => m.id)).toEqual(['b', 'a'])
    expect(s.lineups).toHaveLength(1)
  })

  it('save splices the returned row rather than refetching the shelf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, matchup({ id: 'm1' })))
    vi.stubGlobal('fetch', fetchMock)

    expect(await useStore.getState().save('Cup final')).toBe('ok')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useStore.getState().saved.map((m) => m.id)).toEqual(['m1'])
  })

  it('saving the same name twice replaces the row instead of duplicating it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, matchup({ id: 'm1', savedAt: 200 }))))
    await useStore.getState().save('Cup final')
    await useStore.getState().save('Cup final', true)
    expect(useStore.getState().saved).toHaveLength(1)
  })

  it('reports a name clash as a conflict and names who holds it', async () => {
    const existing = { name: 'Cup final', savedBy: 'mikael', savedAt: 5 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: 'conflict', existing })))

    expect(await useStore.getState().save('Cup final')).toBe('conflict')
    expect(useStore.getState().conflict).toEqual(existing)
    expect(useStore.getState().saved).toEqual([])
  })

  it('remove translates a name to the server id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(200, { matchups: [matchup({ id: 'xyz' })], lineups: [] }))
      .mockResolvedValueOnce(json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await useStore.getState().loadLibrary()
    await useStore.getState().remove('Cup final')

    expect(fetchMock.mock.calls[1][0]).toContain('/matchups/xyz')
    expect(useStore.getState().saved).toEqual([])
  })

  it('removing the matchup being compared against clears the comparison', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json(200, { matchups: [matchup()], lineups: [] }))
      .mockResolvedValueOnce(json(200, { ok: true })))

    await useStore.getState().loadLibrary()
    useStore.getState().setCompareWith('Cup final')
    await useStore.getState().remove('Cup final')

    expect(useStore.getState().compareWith).toBeNull()
  })

  it('a lost session empties the shelf quietly rather than showing an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Authentication required' })))
    await useStore.getState().loadLibrary()
    expect(useStore.getState().library).toBe('idle')
    expect(useStore.getState().libraryError).toBeNull()
  })

  it('clearLibrary empties both shelves on sign-out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {
      matchups: [matchup()], lineups: [lineup()],
    })))
    await useStore.getState().loadLibrary()
    useStore.getState().clearLibrary()

    const s = useStore.getState()
    expect(s.saved).toEqual([])
    expect(s.lineups).toEqual([])
    expect(s.library).toBe('idle')
  })
})

describe('the calculator half stays local', () => {
  it('editing ratings makes no network call', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    useStore.getState().setInput((d) => void (d.teamA.att[0] = 12))
    useStore.getState().setCorrection('afterPk', true)

    expect(useStore.getState().input.teamA.att[0]).toBe(12)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
