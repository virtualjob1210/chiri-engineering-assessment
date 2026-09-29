// Document persistence in localStorage.
// Storage can be missing or throw (private mode, blocked site data, quota),
// so every access is guarded and failures degrade to "not persisted".

const DOCUMENT_KEY = 'ai-doc-editor:document'

/** The subset of the Web Storage API we use; injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Returns the saved document, or null if nothing is saved or storage is unavailable. */
export function loadDocument(store: KeyValueStore | null = browserStore()): string | null {
  try {
    return store?.getItem(DOCUMENT_KEY) ?? null
  } catch {
    return null
  }
}

/** Saves the document. Returns false if it could not be persisted. */
export function saveDocument(doc: string, store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false
  try {
    store.setItem(DOCUMENT_KEY, doc)
    return true
  } catch {
    return false
  }
}
