// Accept / Reject controls for a ready suggestion, anchored under its range.
// The diff itself is drawn inline by the editor; this card only carries the
// actions and the AI's one-line rationale.

import type { EditorView } from '@codemirror/view'
import { useRef } from 'react'
import { isUnchanged } from '../lib/diff.ts'
import { MOD } from '../lib/keys.ts'
import type { ReadySuggestion } from '../editor/suggestionField.ts'
import { useAnchoredPosition } from './useAnchoredPosition.ts'

interface SuggestionCardProps {
  view: EditorView
  suggestion: ReadySuggestion
  onAccept: () => void
  onReject: () => void
}

export function SuggestionCard({ view, suggestion, onAccept, onReject }: SuggestionCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const unchanged = isUnchanged(suggestion.segments)
  useAnchoredPosition(view, suggestion, containerRef, `${suggestion.stale}|${unchanged}`)

  let note = suggestion.rationale
  if (suggestion.stale) note = 'You edited this passage, so the suggestion no longer applies.'
  else if (unchanged) note = `No changes suggested. ${suggestion.rationale}`

  return (
    <div ref={containerRef} className="ai-anchor">
      <div
        className={`suggestion-card${suggestion.stale ? ' is-stale' : ''}`}
        role="group"
        aria-label="AI suggestion"
        // Keep focus in the editor so its keyboard shortcuts keep working.
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="suggestion-actions">
          {!suggestion.stale && !unchanged && (
            <button type="button" className="suggestion-accept" onClick={onAccept}>
              Accept <kbd>{MOD}↵</kbd>
            </button>
          )}
          <button type="button" className="suggestion-reject" onClick={onReject}>
            {suggestion.stale || unchanged ? 'Dismiss' : 'Reject'} <kbd>Esc</kbd>
          </button>
        </div>
        <p className="suggestion-note">{note}</p>
      </div>
    </div>
  )
}
