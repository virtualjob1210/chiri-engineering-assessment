import { history, undo } from '@codemirror/commands'
import { EditorState, type Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  acceptTransaction,
  activeRequestId,
  buildRefineRequest,
  canAccept,
  cancelRefinement,
  clearSuggestion,
  failRequest,
  getSuggestion,
  resolveSuggestion,
  startRefinement,
  startSuggestion,
  suggestionField,
  type ReadySuggestion,
  type Suggestion,
} from './suggestionField.ts'

const DOC = 'Intro. The quick brown fox. Outro.'
const ORIGINAL = 'The quick brown fox.'
const FROM = DOC.indexOf(ORIGINAL)
const TO = FROM + ORIGINAL.length

/** State with a ready suggestion over ORIGINAL. */
function withSuggestion(replacement = 'A fast fox.') {
  let state = EditorState.create({ doc: DOC, extensions: [history(), suggestionField] })
  state = state.update({
    effects: startSuggestion.of({ id: 1, from: FROM, to: TO, original: ORIGINAL, instruction: 'Shorten' }),
  }).state
  return state.update({ effects: resolveSuggestion.of({ requestId: 1, replacement, rationale: 'Shorter.' }) }).state
}

const edit = (state: EditorState, from: number, to: number, insert = '') => state.update({ changes: { from, to, insert } }).state
const current = (state: EditorState) => getSuggestion(state) as Suggestion

describe('suggestion lifecycle', () => {
  it('starts pending and becomes ready with a diff', () => {
    const state = withSuggestion()
    const s = current(state)
    expect(s.status).toBe('ready')
    expect(s.status === 'ready' && s.segments.length).toBeGreaterThan(0)
    expect(canAccept(state)).toBe(true)
  })

  it('ignores a response for a different (replaced) suggestion id', () => {
    let state = EditorState.create({ doc: DOC, extensions: [suggestionField] })
    state = state.update({
      effects: startSuggestion.of({ id: 2, from: FROM, to: TO, original: ORIGINAL, instruction: 'x' }),
    }).state
    state = state.update({ effects: resolveSuggestion.of({ requestId: 1, replacement: 'old', rationale: 'old' }) }).state
    expect(current(state).status).toBe('pending')
  })

  it('reject clears the suggestion without changing the document', () => {
    const state = withSuggestion().update({ effects: clearSuggestion.of(null) }).state
    expect(getSuggestion(state)).toBeNull()
    expect(state.doc.toString()).toBe(DOC)
  })
})

describe('range mapping and staleness', () => {
  it('shifts the range for edits before it and stays valid', () => {
    const state = edit(withSuggestion(), 0, 0, 'NEW ')
    expect(current(state)).toMatchObject({ from: FROM + 4, to: TO + 4, stale: false })
    expect(canAccept(state)).toBe(true)
  })

  it('is unaffected by edits after it', () => {
    const state = edit(withSuggestion(), DOC.length, DOC.length, ' More.')
    expect(current(state)).toMatchObject({ from: FROM, to: TO, stale: false })
  })

  it('does not absorb typing at either edge', () => {
    let state = edit(withSuggestion(), FROM, FROM, '>')
    state = edit(state, TO + 1, TO + 1, '<')
    expect(current(state)).toMatchObject({ from: FROM + 1, to: TO + 1, stale: false })
    expect(state.sliceDoc(current(state).from, current(state).to)).toBe(ORIGINAL)
  })

  it('goes stale when text inside the range is edited', () => {
    const state = edit(withSuggestion(), FROM + 4, FROM + 9, 'slow')
    expect(current(state).stale).toBe(true)
    expect(canAccept(state)).toBe(false)
    expect(acceptTransaction(state)).toBeNull()
  })

  it('goes stale when a deletion overlaps the range edge', () => {
    const state = edit(withSuggestion(), FROM - 3, FROM + 2)
    expect(current(state).stale).toBe(true)
  })

  it('stays stale even if the text is later restored', () => {
    let state = edit(withSuggestion(), FROM + 4, FROM + 9, 'slow')
    state = edit(state, FROM + 4, FROM + 8, 'quick')
    expect(current(state).stale).toBe(true)
  })

  it('maps a pending suggestion too, so the response lands in the right place', () => {
    let state = EditorState.create({ doc: DOC, extensions: [suggestionField] })
    state = state.update({
      effects: startSuggestion.of({ id: 1, from: FROM, to: TO, original: ORIGINAL, instruction: 'x' }),
    }).state
    state = edit(state, 0, 0, 'Hey. ')
    state = state.update({ effects: resolveSuggestion.of({ requestId: 1, replacement: 'A fox.', rationale: 'r' }) }).state
    expect(current(state)).toMatchObject({ status: 'ready', from: FROM + 5, to: TO + 5 })
    expect(canAccept(state)).toBe(true)
  })
})

describe('accept', () => {
  const accept = (state: EditorState) => state.update(acceptTransaction(state)!).state

  it('replaces only the original range and clears the suggestion', () => {
    const state = accept(edit(withSuggestion(), 0, 0, 'NEW '))
    expect(state.doc.toString()).toBe('NEW Intro. A fast fox. Outro.')
    expect(getSuggestion(state)).toBeNull()
  })

  it('places the cursor after the inserted text', () => {
    const state = accept(withSuggestion())
    expect(state.selection.main.head).toBe(FROM + 'A fast fox.'.length)
  })

  it('handles an empty replacement (deletion)', () => {
    expect(accept(withSuggestion('')).doc.toString()).toBe('Intro.  Outro.')
  })

  it('is a single undo step that restores the original text', () => {
    let state = accept(withSuggestion())
    undo({ state, dispatch: (tr: Transaction) => (state = tr.state) })
    expect(state.doc.toString()).toBe(DOC)
  })
})

describe('refinement', () => {
  const ready = (state: EditorState) => getSuggestion(state) as ReadySuggestion

  const startRefine = (state: EditorState, requestId: number, instruction: string) =>
    state.update({ effects: startRefinement.of({ id: 1, requestId, instruction }) }).state

  /** Runs one full refinement round. */
  const refine = (state: EditorState, requestId: number, instruction: string, replacement: string) =>
    startRefine(state, requestId, instruction).update({
      effects: resolveSuggestion.of({ requestId, replacement, rationale: `Did: ${instruction}` }),
    }).state

  it('shows a loading state while keeping the current proposal and diff', () => {
    const before = ready(withSuggestion())
    const state = startRefine(withSuggestion(), 2, 'Shorter')
    const s = ready(state)
    expect(s.refinement).toEqual({ status: 'loading', requestId: 2, instruction: 'Shorter' })
    expect(activeRequestId(s)).toBe(2)
    expect(s.replacement).toBe(before.replacement)
    expect(s.segments).toEqual(before.segments)
  })

  it('replaces the proposal and re-diffs against the original, not the previous proposal', () => {
    const state = refine(withSuggestion(), 2, 'Shorter', 'Fast fox.')
    const s = ready(state)
    expect(s).toMatchObject({ replacement: 'Fast fox.', rationale: 'Did: Shorter', refinement: null })
    const rebuiltOriginal = s.segments.filter((x) => x.kind !== 'insert').map((x) => x.text).join('')
    expect(rebuiltOriginal).toBe(ORIGINAL)
    expect(state.doc.toString()).toBe(DOC)
  })

  it('records every round, oldest first', () => {
    let state = refine(withSuggestion(), 2, 'Shorter', 'Fast fox.')
    state = refine(state, 3, 'More formal', 'A swift fox.')
    expect(ready(state).rounds).toEqual([
      { instruction: 'Shorten', replacement: 'A fast fox.', rationale: 'Shorter.' },
      { instruction: 'Shorter', replacement: 'Fast fox.', rationale: 'Did: Shorter' },
      { instruction: 'More formal', replacement: 'A swift fox.', rationale: 'Did: More formal' },
    ])
  })

  it('builds a request with the original selection and the full history', () => {
    const state = refine(withSuggestion(), 2, 'Shorter', 'Fast fox.')
    const request = buildRefineRequest(state, ready(state), 'Add an example')
    expect(request).toMatchObject({
      instruction: 'Add an example',
      selection: ORIGINAL,
      context: { before: 'Intro. ', after: ' Outro.' },
    })
    expect(request.history.map((t) => t.replacement)).toEqual(['A fast fox.', 'Fast fox.'])
  })

  it('keeps the previous proposal when a refinement fails', () => {
    let state = startRefine(withSuggestion(), 2, 'Shorter')
    state = state.update({ effects: failRequest.of({ requestId: 2, message: 'Upstream timeout' }) }).state
    const s = ready(state)
    expect(s.replacement).toBe('A fast fox.')
    expect(s.rounds).toHaveLength(1)
    expect(s.refinement).toEqual({ status: 'error', instruction: 'Shorter', message: 'Upstream timeout' })
    expect(canAccept(state)).toBe(true)
  })

  it('drops the whole suggestion when the initial request fails', () => {
    let state = EditorState.create({ doc: DOC, extensions: [suggestionField] })
    state = state.update({
      effects: startSuggestion.of({ id: 1, from: FROM, to: TO, original: ORIGINAL, instruction: 'x' }),
    }).state
    state = state.update({ effects: failRequest.of({ requestId: 1, message: 'nope' }) }).state
    expect(getSuggestion(state)).toBeNull()
  })

  it('ignores responses from a cancelled or superseded refinement', () => {
    let state = startRefine(withSuggestion(), 2, 'Shorter')
    state = state.update({ effects: cancelRefinement.of(null) }).state
    state = state.update({ effects: resolveSuggestion.of({ requestId: 2, replacement: 'late', rationale: 'r' }) }).state
    expect(ready(state)).toMatchObject({ replacement: 'A fast fox.', refinement: null })

    state = startRefine(state, 3, 'a')
    state = startRefine(state, 4, 'b')
    state = state.update({ effects: resolveSuggestion.of({ requestId: 3, replacement: 'old', rationale: 'r' }) }).state
    expect(ready(state).replacement).toBe('A fast fox.')
  })

  it('cancels an in-flight refinement when the passage goes stale, and blocks Accept', () => {
    let state = startRefine(withSuggestion(), 2, 'Shorter')
    state = edit(state, FROM + 4, FROM + 9, 'slow')
    expect(ready(state)).toMatchObject({ stale: true, refinement: null })
    expect(activeRequestId(getSuggestion(state))).toBeNull()
    expect(canAccept(state)).toBe(false)
    expect(acceptTransaction(state)).toBeNull()
  })

  it('does not start a refinement on a stale suggestion', () => {
    let state = edit(withSuggestion(), FROM + 4, FROM + 9, 'slow')
    state = startRefine(state, 2, 'Shorter')
    expect(ready(state).refinement).toBeNull()
  })

  it('accepts only the latest proposal after several rounds, as one undoable step', () => {
    let state = refine(withSuggestion(), 2, 'Shorter', 'Fast fox.')
    state = refine(state, 3, 'More formal', 'A swift fox.')
    state = state.update(acceptTransaction(state)!).state
    expect(state.doc.toString()).toBe('Intro. A swift fox. Outro.')

    undo({ state, dispatch: (tr: Transaction) => (state = tr.state) })
    expect(state.doc.toString()).toBe(DOC)
  })
})
