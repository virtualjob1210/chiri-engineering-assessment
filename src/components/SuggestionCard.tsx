// Accept / Reject controls for a ready suggestion, anchored under its range.
// The diff itself is drawn inline by the editor; this card carries the
// actions, the AI's one-line rationale, and a compact field for refining the
// proposal ("shorter", "keep the second sentence", …).

import type { EditorView } from '@codemirror/view'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { SUGGEST_LIMITS } from '../../shared/limits.ts'
import { isUnchanged } from '../lib/diff.ts'
import { MOD } from '../lib/keys.ts'
import type { ReadySuggestion } from '../editor/suggestionField.ts'
import { useAnchoredPosition } from './useAnchoredPosition.ts'

const QUICK_REFINES = [
  { label: 'Shorter', instruction: 'Make it shorter.' },
  { label: 'More formal', instruction: 'Make it more formal.' },
  { label: 'Keep details', instruction: 'Keep more of the original details and wording.' },
] as const

interface SuggestionCardProps {
  view: EditorView
  suggestion: ReadySuggestion
  onAccept: () => void
  onReject: () => void
  onRefine: (instruction: string) => void
  onCancelRefine: () => void
}

export function SuggestionCard({ view, suggestion, onAccept, onReject, onRefine, onCancelRefine }: SuggestionCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { stale, refinement, rounds } = suggestion
  const unchanged = isUnchanged(suggestion.segments)
  const refining = refinement?.status === 'loading'
  const canRefine = !stale && rounds.length <= SUGGEST_LIMITS.historyTurns

  useAnchoredPosition(view, suggestion, containerRef, `${stale}|${unchanged}|${refinement?.status}|${rounds.length}`)

  let note = suggestion.rationale
  if (stale) note = 'You edited this passage, so the suggestion no longer applies.'
  else if (unchanged) note = `No changes suggested. ${suggestion.rationale}`

  // Keep focus where it is (usually the editor) when clicking buttons, so
  // keyboard shortcuts keep working. Text fields still take focus normally.
  const keepFocus = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
  }

  return (
    <div ref={containerRef} className="ai-anchor">
      <div className={`suggestion-card${stale ? ' is-stale' : ''}`} role="group" aria-label="AI suggestion" onMouseDown={keepFocus}>
        <div className="suggestion-actions">
          {!stale && !unchanged && (
            <button type="button" className="suggestion-accept" onClick={onAccept}>
              Accept <kbd>{MOD}↵</kbd>
            </button>
          )}
          <button type="button" className="suggestion-reject" onClick={onReject}>
            {stale || unchanged ? 'Dismiss' : 'Reject'} <kbd>Esc</kbd>
          </button>
          {rounds.length > 1 && <span className="suggestion-round">Revision {rounds.length}</span>}
        </div>
        <p className="suggestion-note">{note}</p>

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
          placeholder="Refine this suggestion…"
          aria-label="Refine this suggestion"
          maxLength={SUGGEST_LIMITS.instruction}
          readOnly={busy}
          autoFocus={autoFocus}
        />
        {QUICK_REFINES.map((action) => (
          <button key={action.label} type="button" className="refine-chip" disabled={busy} onClick={() => submit(action.instruction)}>
            {action.label}
          </button>
        ))}
      </div>
      {busy && <p className="refine-status is-busy">Refining… · Esc to cancel</p>}
      {!busy && error && (
        <p className="refine-status is-error" role="alert">
          Couldn't refine: {error}
        </p>
      )}
    </div>
  )
}
