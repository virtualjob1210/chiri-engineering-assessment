import { describe, expect, it } from 'vitest'
import { loadDocument, saveDocument, type KeyValueStore } from './storage.ts'

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new DOMException('Blocked', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('Full', 'QuotaExceededError')
  },
}

describe('storage', () => {
  it('returns null when nothing has been saved', () => {
    expect(loadDocument(memoryStore())).toBeNull()
  })

  it('round-trips a document', () => {
    const store = memoryStore()
    expect(saveDocument('# Hello\n\nWorld', store)).toBe(true)
    expect(loadDocument(store)).toBe('# Hello\n\nWorld')
  })

  it('keeps an intentionally emptied document instead of treating it as unsaved', () => {
    const store = memoryStore()
    saveDocument('', store)
    expect(loadDocument(store)).toBe('')
  })

  it('degrades gracefully when storage throws', () => {
    expect(loadDocument(throwingStore)).toBeNull()
    expect(saveDocument('text', throwingStore)).toBe(false)
  })

  it('degrades gracefully when storage is unavailable', () => {
    expect(loadDocument(null)).toBeNull()
    expect(saveDocument('text', null)).toBe(false)
  })
})
