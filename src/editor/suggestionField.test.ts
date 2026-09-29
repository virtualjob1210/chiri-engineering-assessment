import { history, undo } from '@codemirror/commands'
import { EditorState, type Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  acceptTransaction,
  canAccept,
  clearSuggestion,
  getSuggestion,
  resolveSuggestion,
  startSuggestion,
  suggestionField,
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
  return state.update({ effects: resolveSuggestion.of({ id: 1, replacement, rationale: 'Shorter.' }) }).state
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
    state = state.update({ effects: resolveSuggestion.of({ id: 1, replacement: 'old', rationale: 'old' }) }).state
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
    state = state.update({ effects: resolveSuggestion.of({ id: 1, replacement: 'A fox.', rationale: 'r' }) }).state
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
