import { history as undoHistory, undo } from '@codemirror/commands'
import { EditorState, type Transaction, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  acceptTransaction,
  clearSuggestion,
  failRequest,
  resolveSuggestion,
  startRefinement,
  startSuggestion,
  suggestionField,
} from '../editor/suggestionField.ts'
import { HISTORY_LIMIT, loadHistory, recordAccepts, recordEdit, saveHistory, type AcceptedEdit } from './history.ts'
import { loadDocument, saveDocument, type KeyValueStore } from './storage.ts'

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) }
}

const edit = (n: number): AcceptedEdit => ({
  instructions: [`Instruction ${n}`],
  rationale: `Rationale ${n}`,
  originalText: `before ${n}`,
  replacementText: `after ${n}`,
  document: `doc after ${n}`,
})

describe('recordEdit', () => {
  it('creates an entry with id, timestamp, revision and the final instruction', () => {
    const now = new Date('2026-09-29T10:00:00Z')
    const [entry] = recordEdit([], { ...edit(1), instructions: ['Make clearer', 'Shorter'] }, { now, id: 'a' })
    expect(entry).toEqual({
      id: 'a',
      createdAt: '2026-09-29T10:00:00.000Z',
      revision: 1,
      instruction: 'Shorter',
      instructions: ['Make clearer', 'Shorter'],
      rationale: 'Rationale 1',
      originalText: 'before 1',
      replacementText: 'after 1',
      document: 'doc after 1',
    })
  })

  it('keeps entries newest first with increasing revisions and unique ids', () => {
    let history = recordEdit([], edit(1))
    history = recordEdit(history, edit(2))
    history = recordEdit(history, edit(3))
    expect(history.map((e) => e.revision)).toEqual([3, 2, 1])
    expect(history[0].replacementText).toBe('after 3')
    expect(new Set(history.map((e) => e.id)).size).toBe(3)
  })

  it(`caps history at ${HISTORY_LIMIT}, dropping the oldest, while revisions keep counting`, () => {
    let history = recordEdit([], edit(1))
    for (let n = 2; n <= HISTORY_LIMIT + 5; n++) history = recordEdit(history, edit(n))
    expect(history).toHaveLength(HISTORY_LIMIT)
    expect(history[0].revision).toBe(HISTORY_LIMIT + 5)
    expect(history[HISTORY_LIMIT - 1].revision).toBe(6)
  })
})

describe('persistence', () => {
  it('round-trips through storage', () => {
    const store = memoryStore()
    const history = recordEdit(recordEdit([], edit(1)), edit(2))
    expect(saveHistory(history, store)).toBe(true)
    expect(loadHistory(store)).toEqual(history)
  })

  it('uses its own key and never touches the saved document', () => {
    const store = memoryStore()
    saveDocument('# My doc', store)
    saveHistory(recordEdit([], edit(1)), store)
    expect(loadDocument(store)).toBe('# My doc')
  })

  it('returns an empty history when nothing is saved, storage is unavailable, or data is corrupt', () => {
    expect(loadHistory(memoryStore())).toEqual([])
    expect(loadHistory(null)).toEqual([])
    const corrupt = memoryStore()
    corrupt.setItem('ai-doc-editor:history', '{not json')
    expect(loadHistory(corrupt)).toEqual([])
  })

  it('drops malformed entries and restores newest-first order', () => {
    const store = memoryStore()
    const [e1] = recordEdit([], edit(1))
    const [e2] = recordEdit([e1], edit(2))
    store.setItem('ai-doc-editor:history', JSON.stringify([e1, { revision: 9 }, e2]))
    expect(loadHistory(store).map((e) => e.revision)).toEqual([2, 1])
  })
})

// ---- Integration with the editor's accept flow --------------------------------

const DOC = 'Intro. The quick brown fox. Outro.'
const ORIGINAL = 'The quick brown fox.'
const FROM = DOC.indexOf(ORIGINAL)

/** Runs specs against editor state, collecting every transaction. */
function session() {
  let state = EditorState.create({ doc: DOC, extensions: [undoHistory(), suggestionField] })
  const transactions: Transaction[] = []
  const apply = (tr: Transaction) => {
    transactions.push(tr)
    state = tr.state
  }
  return {
    transactions,
    get state() {
      return state
    },
    run: (spec: TransactionSpec) => apply(state.update(spec)),
    ask: (id: number, instruction: string, replacement: string) => {
      apply(state.update({ effects: startSuggestion.of({ id, from: FROM, to: FROM + ORIGINAL.length, original: ORIGINAL, instruction }) }))
      apply(state.update({ effects: resolveSuggestion.of({ requestId: id, replacement, rationale: `Did: ${instruction}` }) }))
    },
    refine: (requestId: number, instruction: string, replacement: string) => {
      apply(state.update({ effects: startRefinement.of({ id: 1, requestId, instruction }) }))
      apply(state.update({ effects: resolveSuggestion.of({ requestId, replacement, rationale: `Did: ${instruction}` }) }))
    },
    accept: () => apply(state.update(acceptTransaction(state)!)),
    undo: () => undo({ state, dispatch: apply }),
  }
}

describe('recordAccepts', () => {
  it('records one entry for an accepted suggestion, with the resulting document', () => {
    const s = session()
    s.ask(1, 'Shorten', 'A fox.')
    s.accept()
    const history = recordAccepts([], s.transactions)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      instruction: 'Shorten',
      originalText: ORIGINAL,
      replacementText: 'A fox.',
      document: 'Intro. A fox. Outro.',
    })
  })

  it('records nothing for a rejected suggestion, a failed request, or manual typing', () => {
    const s = session()
    s.ask(1, 'Shorten', 'A fox.')
    s.run({ effects: clearSuggestion.of(null) })
    s.run({ effects: startSuggestion.of({ id: 2, from: FROM, to: FROM + 3, original: 'The', instruction: 'x' }) })
    s.run({ effects: failRequest.of({ requestId: 2, message: 'boom' }) })
    s.run({ changes: { from: 0, insert: 'Typed. ' } })
    const history: never[] = []
    expect(recordAccepts(history, s.transactions)).toBe(history)
  })

  it('records a refined suggestion once, using the final proposal and the full instruction chain', () => {
    const s = session()
    s.ask(1, 'Make clearer', 'A quick fox.')
    s.refine(2, 'Shorter', 'A fox.')
    s.refine(3, 'More formal', 'A swift fox.')
    s.accept()
    const history = recordAccepts([], s.transactions)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      revision: 1,
      instruction: 'More formal',
      instructions: ['Make clearer', 'Shorter', 'More formal'],
      rationale: 'Did: More formal',
      replacementText: 'A swift fox.',
      document: 'Intro. A swift fox. Outro.',
    })
  })

  it('does not record undo, and undo still restores the text exactly', () => {
    const s = session()
    s.ask(1, 'Shorten', 'A fox.')
    s.accept()
    const afterAccept = s.transactions.length
    s.undo()
    expect(s.state.doc.toString()).toBe(DOC)
    expect(recordAccepts([], s.transactions.slice(afterAccept))).toEqual([])
  })
})
