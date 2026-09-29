// Contextual AI entry point anchored to the current selection.
// Two states: a small "Ask AI" hint while text is selected, and the command
// panel (instruction field + quick actions) once opened. Position is read
// from CodeMirror and applied straight to the DOM, so scrolling doesn't
// trigger React renders.

import type { EditorView } from '@codemirror/view'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { SUGGEST_LIMITS } from '../../shared/limits.ts'
import type { TextRange } from '../lib/context.ts'

const QUICK_ACTIONS = [
  { label: 'Shorten', instruction: "Make this more concise. Keep the key points and the author's voice." },
  { label: 'Make clearer', instruction: 'Rewrite this to be clearer and easier to follow without changing its meaning.' },
  { label: 'More formal', instruction: 'Rewrite this in a more formal, professional tone.' },
  { label: 'Fix grammar', instruction: 'Fix spelling, grammar and punctuation only. Do not otherwise change the wording.' },
] as const

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl+K'

const GAP = 8
const EDGE = 8

/**
 * Pins `elementRef` below the range (or above it if there's no room) and
 * keeps it there while the editor scrolls or the window resizes. Hidden
 * when the range is scrolled out of the editor's visible area.
 */
function useAnchoredPosition(
  view: EditorView,
  range: TextRange,
  elementRef: RefObject<HTMLElement | null>,
  layoutKey: string,
) {
  useLayoutEffect(() => {
    const el = elementRef.current
    if (!el) return
    let frame = 0

    const place = () => {
      frame = 0
      const start = view.coordsAtPos(range.from, 1)
      const end = view.coordsAtPos(range.to, -1)
      const visible = view.scrollDOM.getBoundingClientRect()
      if (!start || !end || end.bottom < visible.top || start.top > visible.bottom) {
        el.style.visibility = 'hidden'
        return
      }

      const { offsetWidth: width, offsetHeight: height } = el
      let top = end.bottom + GAP
      if (top + height > window.innerHeight - EDGE) top = start.top - height - GAP
      top = Math.max(EDGE, top)
      const left = Math.max(EDGE, Math.min(Math.min(start.left, end.left), window.innerWidth - width - EDGE))

      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
      el.style.visibility = 'visible'
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }

    place()
    view.scrollDOM.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      view.scrollDOM.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [view, range.from, range.to, elementRef, layoutKey])
}

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
          <span aria-hidden="true">✦</span> Ask AI <kbd>{SHORTCUT_LABEL}</kbd>
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
