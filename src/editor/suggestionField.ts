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
import { diffText, type DiffSegment } from '../lib/diff.ts'

interface SuggestionBase {
  id: number
  /** Current position of the original range; mapped through every edit. */
  from: number
  to: number
  /** Snapshot of the text at request time. */
  original: string
  instruction: string
  /** True once an edit has touched the range; Accept is then disabled. */
  stale: boolean
}

export type PendingSuggestion = SuggestionBase & { status: 'pending' }
export type ReadySuggestion = SuggestionBase & {
  status: 'ready'
  replacement: string
  rationale: string
  segments: DiffSegment[]
}
export type Suggestion = PendingSuggestion | ReadySuggestion

// ---- Effects ---------------------------------------------------------------

export const startSuggestion = StateEffect.define<Omit<PendingSuggestion, 'status' | 'stale'>>()
export const resolveSuggestion = StateEffect.define<{ id: number; replacement: string; rationale: string }>()
export const clearSuggestion = StateEffect.define<null>()

// ---- Pure state logic --------------------------------------------------------

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

    for (const effect of tr.effects) {
      if (effect.is(startSuggestion)) {
        suggestion = { ...effect.value, status: 'pending', stale: false }
      } else if (effect.is(resolveSuggestion)) {
        // Ignore responses for a suggestion that was replaced or cleared.
        if (suggestion?.id === effect.value.id) {
          const { replacement, rationale } = effect.value
          suggestion = {
            ...suggestion,
            status: 'ready',
            replacement,
            rationale,
            segments: diffText(suggestion.original, replacement),
          }
        }
      } else if (effect.is(clearSuggestion)) {
        suggestion = null
      }
    }
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
const deleteMark = Decoration.mark({ class: 'cm-diff-delete' })

function buildDecorations(suggestion: Suggestion | null): DecorationSet {
  if (!suggestion || suggestion.from === suggestion.to) return Decoration.none
  const { from, to } = suggestion

  if (suggestion.status === 'pending') return Decoration.set(pendingMark.range(from, to))
  // Offsets into the original no longer line up once the text was edited.
  if (suggestion.stale) return Decoration.set(staleMark.range(from, to))

  const ranges = [rangeMark.range(from, to)]
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
