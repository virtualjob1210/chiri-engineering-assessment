// The single active AI suggestion, stored in CodeMirror state.
//
// Living in editor state (not React) means every transaction maps the
// suggestion's range for free, staleness is decided in the same step as the
// edit, and Accept is an ordinary transaction that the undo history records.

import { isolateHistory } from '@codemirror/commands'
import {
  Prec,
  StateEffect,
  StateField,
  type ChangeDesc,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from '@codemirror/view'
import type { RefinementTurn, SuggestRequest } from '../../shared/api.ts'
import { extractContext } from '../lib/context.ts'
import { diffText, type DiffSegment } from '../lib/diff.ts'

interface SuggestionBase {
  /** Also the request id of the initial ask. */
  id: number
  /** Current position of the original range; mapped through every edit. */
  from: number
  to: number
  /** Snapshot of the text at request time. Never changes while refining. */
  original: string
  instruction: string
  /** True once an edit has touched the range; Accept is then disabled. */
  stale: boolean
}

/** Follow-up request state for a ready suggestion. */
export type Refinement =
  | { status: 'loading'; requestId: number; instruction: string }
  | { status: 'error'; instruction: string; message: string }

export type PendingSuggestion = SuggestionBase & { status: 'pending' }
export type ReadySuggestion = SuggestionBase & {
  status: 'ready'
  /** Every completed proposal, oldest first. The last one is on screen. */
  rounds: RefinementTurn[]
  /** Latest proposal, kept alongside `rounds` for convenient access. */
  replacement: string
  rationale: string
  /** Diff of the latest proposal against `original`. */
  segments: DiffSegment[]
  refinement: Refinement | null
}
export type Suggestion = PendingSuggestion | ReadySuggestion

// ---- Effects ---------------------------------------------------------------

export const startSuggestion = StateEffect.define<Omit<PendingSuggestion, 'status' | 'stale'>>()
export const startRefinement = StateEffect.define<{ id: number; requestId: number; instruction: string }>()
/** A response for the initial ask or a refinement, matched by request id. */
export const resolveSuggestion = StateEffect.define<{ requestId: number; replacement: string; rationale: string }>()
/** A failed request: drops a pending suggestion, or keeps the last proposal on a refinement. */
export const failRequest = StateEffect.define<{ requestId: number; message: string }>()
export const cancelRefinement = StateEffect.define<null>()
export const clearSuggestion = StateEffect.define<null>()

// ---- Pure state logic --------------------------------------------------------

/** Id of the request this suggestion is waiting on, if any. */
export function activeRequestId(suggestion: Suggestion | null): number | null {
  if (!suggestion) return null
  if (suggestion.status === 'pending') return suggestion.id
  return suggestion.refinement?.status === 'loading' ? suggestion.refinement.requestId : null
}

function withProposal(base: Suggestion, rounds: RefinementTurn[]): ReadySuggestion {
  const { replacement, rationale } = rounds[rounds.length - 1]
  return {
    ...base,
    status: 'ready',
    rounds,
    replacement,
    rationale,
    segments: diffText(base.original, replacement),
    refinement: null,
  }
}

function applyEffect(suggestion: Suggestion | null, effect: StateEffect<unknown>): Suggestion | null {
  if (effect.is(startSuggestion)) return { ...effect.value, status: 'pending', stale: false }
  if (effect.is(clearSuggestion)) return null
  if (!suggestion) return null

  if (effect.is(startRefinement)) {
    const { id, requestId, instruction } = effect.value
    if (suggestion.id !== id || suggestion.status !== 'ready' || suggestion.stale) return suggestion
    return { ...suggestion, refinement: { status: 'loading', requestId, instruction } }
  }

  // Responses for anything other than the current request are ignored.
  const waitingOn = activeRequestId(suggestion)
  if (effect.is(resolveSuggestion) && effect.value.requestId === waitingOn) {
    const { replacement, rationale } = effect.value
    if (suggestion.status === 'pending') {
      return withProposal(suggestion, [{ instruction: suggestion.instruction, replacement, rationale }])
    }
    const instruction = suggestion.refinement!.instruction
    return withProposal(suggestion, [...suggestion.rounds, { instruction, replacement, rationale }])
  }
  if (effect.is(failRequest) && effect.value.requestId === waitingOn) {
    if (suggestion.status === 'pending') return null
    const instruction = suggestion.refinement!.instruction
    return { ...suggestion, refinement: { status: 'error', instruction, message: effect.value.message } }
  }
  if (effect.is(cancelRefinement) && suggestion.status === 'ready') {
    return { ...suggestion, refinement: null }
  }
  return suggestion
}

/**
 * Request body for refining the on-screen proposal. The selection is always
 * the original text; `history` carries every proposal so far, so the model
 * revises its latest version instead of starting over.
 */
export function buildRefineRequest(state: EditorState, suggestion: ReadySuggestion, instruction: string): SuggestRequest {
  return {
    instruction,
    selection: suggestion.original,
    context: extractContext(state.doc.toString(), suggestion.from, suggestion.to),
    history: suggestion.rounds,
  }
}

/**
 * Maps a suggestion through a document change. Edits strictly outside the
 * range just shift it. Any edit that overlaps it, or inserts inside it, marks
 * it stale. Typing right at either edge counts as outside: `from` maps
 * forward and `to` maps backward, so edge insertions never join the range.
 */
export function mapSuggestion<S extends Suggestion>(suggestion: S, changes: ChangeDesc): S {
  let touched = false
  changes.iterChangedRanges((fromA, toA) => {
    if (fromA < suggestion.to && toA > suggestion.from) touched = true
  })
  const from = changes.mapPos(suggestion.from, 1)
  const to = Math.max(from, changes.mapPos(suggestion.to, -1))
  return { ...suggestion, from, to, stale: suggestion.stale || touched }
}

export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    let suggestion = value && tr.docChanged ? mapSuggestion(value, tr.changes) : value
    // A stale passage can't be accepted, so an in-flight refinement is moot.
    if (suggestion?.status === 'ready' && suggestion.stale && suggestion.refinement) {
      suggestion = { ...suggestion, refinement: null }
    }
    for (const effect of tr.effects) suggestion = applyEffect(suggestion, effect)
    return suggestion
  },
  provide: (field) => EditorView.decorations.from(field, buildDecorations),
})

export const getSuggestion = (state: EditorState) => state.field(suggestionField, false) ?? null

/** True if Accept is currently allowed. */
export function canAccept(state: EditorState): boolean {
  const s = getSuggestion(state)
  return !!s && s.status === 'ready' && !s.stale && state.sliceDoc(s.from, s.to) === s.original
}

/**
 * Transaction that applies the suggestion: replaces exactly the original
 * range, clears the suggestion, and is isolated as its own undo step.
 * Returns null if the suggestion can't be applied.
 */
export function acceptTransaction(state: EditorState): TransactionSpec | null {
  const s = getSuggestion(state)
  if (!s || s.status !== 'ready' || !canAccept(state)) return null
  return {
    changes: { from: s.from, to: s.to, insert: s.replacement },
    selection: { anchor: s.from + s.replacement.length },
    effects: clearSuggestion.of(null),
    annotations: isolateHistory.of('full'),
    userEvent: 'input.ai.accept',
    scrollIntoView: true,
  }
}

// ---- Commands ----------------------------------------------------------------

/** Accepts if possible. Consumes the key whenever a suggestion exists. */
export function acceptSuggestion(view: EditorView): boolean {
  if (!getSuggestion(view.state)) return false
  const spec = acceptTransaction(view.state)
  if (spec) view.dispatch(spec)
  return true
}

/** Removes the suggestion (and cancels a pending one) without touching the text. */
export function rejectSuggestion(view: EditorView): boolean {
  if (!getSuggestion(view.state)) return false
  view.dispatch({ effects: clearSuggestion.of(null) })
  return true
}

// ---- Rendering -----------------------------------------------------------------

class InsertionWidget extends WidgetType {
  readonly text: string

  constructor(text: string) {
    super()
    this.text = text
  }

  eq(other: InsertionWidget) {
    return other.text === this.text
  }

  toDOM() {
    const el = document.createElement('ins')
    el.className = 'cm-diff-insert'
    el.textContent = this.text
    return el
  }
}

const pendingMark = Decoration.mark({ class: 'cm-suggest-pending' })
const staleMark = Decoration.mark({ class: 'cm-suggest-stale' })
const rangeMark = Decoration.mark({ class: 'cm-suggest-range' })
const refiningRangeMark = Decoration.mark({ class: 'cm-suggest-range cm-suggest-refining' })
const deleteMark = Decoration.mark({ class: 'cm-diff-delete' })

function buildDecorations(suggestion: Suggestion | null): DecorationSet {
  if (!suggestion || suggestion.from === suggestion.to) return Decoration.none
  const { from, to } = suggestion

  if (suggestion.status === 'pending') return Decoration.set(pendingMark.range(from, to))
  // Offsets into the original no longer line up once the text was edited.
  if (suggestion.stale) return Decoration.set(staleMark.range(from, to))

  // The current diff stays visible while a refinement runs, gently pulsing.
  const refining = suggestion.refinement?.status === 'loading'
  const ranges = [(refining ? refiningRangeMark : rangeMark).range(from, to)]
  let pos = from
  for (const segment of suggestion.segments) {
    if (segment.kind === 'insert') {
      ranges.push(Decoration.widget({ widget: new InsertionWidget(segment.text), side: 1 }).range(pos))
    } else {
      if (segment.kind === 'delete') ranges.push(deleteMark.range(pos, pos + segment.text.length))
      pos += segment.text.length
    }
  }
  return Decoration.set(ranges, true)
}

const suggestionTheme = EditorView.baseTheme({
  '.cm-suggest-pending': {
    backgroundColor: 'var(--pending-bg)',
    animation: 'cm-suggest-pulse 1.4s ease-in-out infinite',
  },
  '@keyframes cm-suggest-pulse': {
    '50%': { backgroundColor: 'transparent' },
  },
  '.cm-suggest-range': {
    backgroundColor: 'var(--suggest-bg)',
  },
  '.cm-suggest-refining': {
    animation: 'cm-suggest-fade 1.4s ease-in-out infinite',
  },
  '@keyframes cm-suggest-fade': {
    '50%': { opacity: '0.55' },
  },
  '.cm-suggest-stale': {
    textDecoration: 'underline dashed var(--muted)',
    textUnderlineOffset: '4px',
  },
  '.cm-diff-delete': {
    color: 'var(--delete-fg)',
    backgroundColor: 'var(--delete-bg)',
    textDecoration: 'line-through',
    textDecorationColor: 'var(--delete-fg)',
  },
  '.cm-diff-insert': {
    color: 'var(--insert-fg)',
    backgroundColor: 'var(--insert-bg)',
    textDecoration: 'none',
    whiteSpace: 'pre-wrap',
  },
})

// Highest precedence so Mod-Enter beats the default "insert blank line" and
// Escape is handled before anything else while a suggestion is visible.
const suggestionKeymap = Prec.highest(
  keymap.of([
    { key: 'Mod-Enter', run: acceptSuggestion },
    { key: 'Escape', run: rejectSuggestion },
  ]),
)

export const suggestionExtension: Extension = [suggestionField, suggestionKeymap, suggestionTheme]
