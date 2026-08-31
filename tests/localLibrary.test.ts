import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { legacyCounts, markImported, readLegacy, wasImported } from '../src/migrate/localLibrary'

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  return store
}

beforeEach(() => stubStorage())
afterEach(() => vi.unstubAllGlobals())

describe('legacy localStorage library', () => {
  it('reads what earlier versions saved', () => {
    stubStorage({
      'nickonline-saved-v1': JSON.stringify([{ name: 'Cup final', savedAt: 1 }]),
      'nickonline-lineups-v1': JSON.stringify([{ id: 'A-1', name: '4-4-2', side: 'A' }]),
    })
    expect(legacyCounts()).toEqual({ matchups: 1, lineups: 1 })
    expect(readLegacy().matchups[0].name).toBe('Cup final')
  })

  it('reports nothing when the browser has nothing', () => {
    expect(legacyCounts()).toEqual({ matchups: 0, lineups: 0 })
  })

  it('treats corrupt JSON as nothing to offer, not as an error', () => {
    stubStorage({ 'nickonline-saved-v1': '{not json' })
    expect(legacyCounts().matchups).toBe(0)
  })

  it('treats a non-array value as nothing to offer', () => {
    stubStorage({ 'nickonline-saved-v1': '{"name":"not a list"}' })
    expect(legacyCounts().matchups).toBe(0)
  })

  it('survives storage being blocked entirely', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(legacyCounts()).toEqual({ matchups: 0, lineups: 0 })
    expect(wasImported()).toBe(false)
    expect(() => markImported()).not.toThrow()
  })

  it('marks an import without deleting the originals', () => {
    const store = stubStorage({
      'nickonline-saved-v1': JSON.stringify([{ name: 'Cup final', savedAt: 1 }]),
    })
    expect(wasImported()).toBe(false)
    markImported()
    expect(wasImported()).toBe(true)
    expect(store.get('nickonline-saved-v1')).toBeTruthy()
  })
})
