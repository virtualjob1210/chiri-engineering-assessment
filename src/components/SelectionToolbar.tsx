// Contextual AI entry point anchored to the current selection.
// Two states: a small "Ask AI" hint while text is selected, and the command
// panel (instruction field + quick actions) once opened.

import type { EditorView } from '@codemirror/view'
import { useRef, useState, type KeyboardEvent } from 'react'
import { SUGGEST_LIMITS } from '../../shared/limits.ts'
import type { TextRange } from '../lib/context.ts'
import { MOD } from '../lib/keys.ts'
import { useAnchoredPosition } from './useAnchoredPosition.ts'

const QUICK_ACTIONS = [
  { label: 'Shorten', instruction: "Make this more concise. Keep the key points and the author's voice." },
  { label: 'Make clearer', instruction: 'Rewrite this to be clearer and easier to follow without changing its meaning.' },
  { label: 'More formal', instruction: 'Rewrite this in a more formal, professional tone.' },
  { label: 'Fix grammar', instruction: 'Fix spelling, grammar and punctuation only. Do not otherwise change the wording.' },
] as const

interface SelectionToolbarProps {
  view: EditorView
  range: TextRange
  open: boolean
  busy: boolean
  error: string | null
  onOpen: () => void
  onClose: () => void
  onSubmit: (instruction: string) => void
}

export function SelectionToolbar({ view, range, open, busy, error, onOpen, onClose, onSubmit }: SelectionToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [instruction, setInstruction] = useState('')

  useAnchoredPosition(view, range, containerRef, `${open}|${busy}|${error}`)

  const submit = (text: string) => {
    if (busy || text.trim() === '') return
    // Keep focus in the panel so Esc can still cancel while the request runs.
    inputRef.current?.focus()
    onSubmit(text.trim())
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Enter' && event.target === inputRef.current && !event.nativeEvent.isComposing) {
      // Plain Enter and Ctrl/Cmd+Enter both submit from the single-line field.
      event.preventDefault()
      submit(instruction)
    }
  }

  if (!open) {
    return (
      <div ref={containerRef} className="ai-anchor">
        <button
          type="button"
          className="ai-hint"
          // Keep editor focus and selection intact when clicking the hint.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpen}
        >
          <span aria-hidden="true">✦</span> Ask AI <kbd>{MOD}K</kbd>
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="ai-anchor">
      <div className="ai-command" role="dialog" aria-label="Ask AI about the selection" onKeyDown={handleKeyDown}>
        <div className="ai-command-row">
          <input
            ref={inputRef}
            className="ai-command-input"
            autoFocus
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Tell the AI what to change…"
            aria-label="Instruction"
            maxLength={SUGGEST_LIMITS.instruction}
            readOnly={busy}
          />
          <button
            type="button"
            className="ai-command-send"
            onClick={() => submit(instruction)}
            disabled={busy || instruction.trim() === ''}
          >
            Ask
          </button>
        </div>
        <div className="ai-command-actions">
          {QUICK_ACTIONS.map((action) => (
            <button key={action.label} type="button" onClick={() => submit(action.instruction)} disabled={busy}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="ai-command-status" aria-live="polite">
          {busy ? (
            <span className="ai-thinking">Thinking… · Esc to cancel</span>
          ) : error ? (
            <span className="ai-error" role="alert">{error}</span>
          ) : (
            <span>Enter to send · Esc to close</span>
          )}
        </div>
      </div>
    </div>
  )
}
