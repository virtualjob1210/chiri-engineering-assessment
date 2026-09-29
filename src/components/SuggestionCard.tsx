// Accept / Reject controls for a ready suggestion, anchored under its range.
// The diff itself is drawn inline by the editor; this card carries the
// actions, the AI's one-line rationale, and a compact field for refining the
// proposal ("shorter", "keep the second sentence", …).

import { EditorView } from '@codemirror/view'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { SUGGEST_LIMITS } from '../../shared/limits.ts'
import { isUnchanged } from '../lib/diff.ts'
import { MOD, MOD_ARIA } from '../lib/keys.ts'
import { getSuggestion, reserveCardSpace, type ReadySuggestion } from '../editor/suggestionField.ts'
import { useAnchoredPosition } from './useAnchoredPosition.ts'

const QUICK_REFINES = [
  { label: 'Shorter', instruction: 'Make it shorter.' },
  { label: 'More formal', instruction: 'Make it more formal.' },
  { label: 'Keep details', instruction: 'Keep more of the original details and wording.' },
] as const

/** Breathing room above and below the card inside its reserved space. */
const SPACE_PADDING = 16

interface SuggestionCardProps {
  view: EditorView
  suggestion: ReadySuggestion
  onAccept: () => void
  onReject: () => void
  onRefine: (instruction: string) => void
  onCancelRefine: () => void
}

/**
 * Reports the card's height to the editor, which reserves that much empty
 * space under the passage so the card never covers the following text.
 * Scrolls the reserved space into view when the card first appears.
 */
function useReservedSpace(view: EditorView, cardRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    let reserved = 0

    const report = (scroll: boolean) => {
      const height = card.offsetHeight + SPACE_PADDING
      if (height === reserved) return
      reserved = height
      const anchor = getSuggestion(view.state)?.to
      const reveal = scroll && anchor !== undefined
      view.dispatch({
        effects: [
          reserveCardSpace.of(height),
          ...(reveal ? [EditorView.scrollIntoView(anchor, { y: 'nearest', yMargin: height + 24 })] : []),
        ],
      })
    }

    report(true)
    const observer = new ResizeObserver(() => report(false))
    observer.observe(card)
    return () => observer.disconnect()
  }, [view, cardRef])
}

export function SuggestionCard({ view, suggestion, onAccept, onReject, onRefine, onCancelRefine }: SuggestionCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const { stale, refinement, rounds } = suggestion
  const unchanged = isUnchanged(suggestion.segments)
  const refining = refinement?.status === 'loading'
  const canRefine = !stale && rounds.length <= SUGGEST_LIMITS.historyTurns

  useReservedSpace(view, cardRef)
  useAnchoredPosition(view, suggestion, containerRef, `${stale}|${unchanged}|${refinement?.status}|${rounds.length}`, {
    flip: false,
  })

  let note = suggestion.rationale
  if (stale) note = 'This text changed after the suggestion was made. Dismiss it and ask again.'
  else if (unchanged) note = `No changes needed. ${suggestion.rationale}`

  // Keep focus where it is (usually the editor) when clicking buttons, so
  // keyboard shortcuts keep working. Text fields still take focus normally.
  const keepFocus = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
  }

  return (
    <div ref={containerRef} className="ai-anchor">
      <div
        ref={cardRef}
        className={`suggestion-card${stale ? ' is-stale' : ''}`}
        role="group"
        aria-label="AI suggestion"
        onMouseDown={keepFocus}
      >
        <div className="suggestion-actions">
          {!stale && !unchanged && (
            <button type="button" className="btn btn-accept" onClick={onAccept} aria-keyshortcuts={`${MOD_ARIA}+Enter`}>
              Accept <kbd>{MOD}↵</kbd>
            </button>
          )}
          <button type="button" className="btn" onClick={onReject} aria-keyshortcuts="Escape">
            {stale || unchanged ? 'Dismiss' : 'Reject'} <kbd>Esc</kbd>
          </button>
          {rounds.length > 1 && <span className="suggestion-round">Revision {rounds.length}</span>}
        </div>
        <p className="suggestion-note" role="status">
          {note}
        </p>

        {canRefine && (
          // Remounted after each successful round so the field starts empty,
          // while a failed round keeps whatever the user typed.
          <RefineField
            key={rounds.length}
            autoFocus={rounds.length > 1}
            busy={refining}
            error={refinement?.status === 'error' ? refinement.message : null}
            onSubmit={onRefine}
            onAccept={onAccept}
            onCancel={onCancelRefine}
            onExit={() => view.focus()}
          />
        )}
      </div>
    </div>
  )
}

interface RefineFieldProps {
  autoFocus: boolean
  busy: boolean
  error: string | null
  onSubmit: (instruction: string) => void
  onAccept: () => void
  onCancel: () => void
  onExit: () => void
}

function RefineField({ autoFocus, busy, error, onSubmit, onAccept, onCancel, onExit }: RefineFieldProps) {
  const [text, setText] = useState('')

  const submit = (instruction: string) => {
    if (!busy && instruction.trim()) onSubmit(instruction.trim())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      // Ctrl/Cmd+Enter on an empty field accepts, matching the card's hint.
      if ((event.metaKey || event.ctrlKey) && !text.trim()) onAccept()
      else submit(text)
    } else if (event.key === 'Escape') {
      // Esc never rejects from here: it cancels a running refinement, then
      // clears the field, then returns to the editor (where Esc rejects).
      event.preventDefault()
      if (busy) onCancel()
      else if (text) setText('')
      else onExit()
    }
  }

  return (
    <div className="refine">
      <div className="refine-row">
        <input
          className="refine-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Refine, e.g. “warmer”…"
          aria-label="Refine this suggestion"
          maxLength={SUGGEST_LIMITS.instruction}
          readOnly={busy}
          autoFocus={autoFocus}
        />
        {QUICK_REFINES.map((action) => (
          <button key={action.label} type="button" className="chip" disabled={busy} onClick={() => submit(action.instruction)}>
            {action.label}
          </button>
        ))}
      </div>
      {busy && <p className="status is-busy">Revising… Esc to cancel</p>}
      {!busy && error && (
        <p className="status is-error" role="alert">
          Couldn't revise: {error}
        </p>
      )}
    </div>
  )
}
