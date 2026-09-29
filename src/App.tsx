import { isolateHistory } from '@codemirror/commands'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { useEffect, useRef, useState } from 'react'
import type { SuggestRequest } from '../shared/api.ts'
import { SUGGEST_LIMITS } from '../shared/limits.ts'
import { SelectionToolbar } from './components/SelectionToolbar.tsx'
import { SuggestionCard } from './components/SuggestionCard.tsx'
import { VersionHistory } from './components/VersionHistory.tsx'
import { Editor } from './editor/Editor.tsx'
import { aiCommandKeymap, autosave } from './editor/extensions.ts'
import {
  acceptSuggestion,
  activeRequestId,
  buildRefineRequest,
  cancelRefinement,
  clearSuggestion,
  failRequest,
  getSuggestion,
  rejectSuggestion,
  resolveSuggestion,
  startRefinement,
  startSuggestion,
  suggestionAccepted,
  suggestionExtension,
  type Suggestion,
} from './editor/suggestionField.ts'
import { fetchSuggestion, type SuggestResult } from './lib/apiClient.ts'
import { extractContext, trimRange, type TextRange } from './lib/context.ts'
import { loadHistory, recordAccepts, saveHistory } from './lib/history.ts'
import { MOD } from './lib/keys.ts'
import { loadDocument, saveDocument } from './lib/storage.ts'
import { SAMPLE_DOC } from './sampleDoc.ts'

/** Current selection trimmed of surrounding whitespace, or null if none. */
function readSelection(view: EditorView): TextRange | null {
  const { from, to } = view.state.selection.main
  return trimRange(view.state.sliceDoc(from, to), from)
}

const sameRange = (a: TextRange | null, b: TextRange | null) => a?.from === b?.from && a?.to === b?.to

export default function App() {
  const [initialDoc] = useState(() => loadDocument() ?? SAMPLE_DOC)
  const [view, setView] = useState<EditorView | null>(null)
  const [selection, setSelection] = useState<TextRange | null>(null)
  const [editorFocused, setEditorFocused] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  // Mirror of the editor's suggestion field; CodeMirror remains the owner.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [history, setHistory] = useState(() => loadHistory())
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  // The in-flight request (initial ask or refinement). A ref because it's
  // only read in callbacks.
  const pendingRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const nextIdRef = useRef(1)

  // Created once: the editor reads its extensions only at mount. State
  // setters are stable, so capturing them here is safe.
  const [editorExtensions] = useState(() => [
    autosave((doc) => saveDocument(doc)),
    suggestionExtension,
    aiCommandKeymap((v) => {
      if (readSelection(v)) setCommandOpen(true)
    }),
  ])

  const loading = suggestion?.status === 'pending'

  useEffect(() => {
    saveHistory(history)
  }, [history])

  const handleUpdate = (update: ViewUpdate) => {
    // Every accept path produces a transaction tagged with the accepted
    // suggestion; record those (and nothing else) in version history.
    if (update.transactions.some((tr) => tr.annotation(suggestionAccepted))) {
      setHistory((prev) => recordAccepts(prev, update.transactions))
    }

    const next = getSuggestion(update.state)
    if (next !== getSuggestion(update.startState)) {
      setSuggestion(next)
      // The suggestion stopped waiting on our request (rejected, replaced,
      // cancelled, or went stale): stop paying for it.
      if (pendingRef.current && activeRequestId(next) !== pendingRef.current.id) {
        pendingRef.current.controller.abort()
        pendingRef.current = null
        setCommandOpen(false)
      }
    }

    if (!update.selectionSet && !update.docChanged && !update.focusChanged) return
    setSelection((prev) => {
      const range = readSelection(update.view)
      return sameRange(prev, range) ? prev : range
    })
    setEditorFocused(update.view.hasFocus)
    // Moving the selection dismisses the command panel unless it's waiting.
    if ((update.selectionSet || update.docChanged) && getSuggestion(update.state)?.status !== 'pending') {
      setCommandOpen(false)
      setCommandError(null)
    }
  }

  const closeCommand = () => {
    // Cancels an in-flight first ask (the request is aborted in handleUpdate).
    if (view && getSuggestion(view.state)?.status === 'pending') rejectSuggestion(view)
    setCommandOpen(false)
    setCommandError(null)
    view?.focus()
  }

  /** Sends a request; resolves to null if it was cancelled or superseded meanwhile. */
  const send = async (requestId: number, body: SuggestRequest): Promise<SuggestResult | null> => {
    const controller = new AbortController()
    pendingRef.current = { id: requestId, controller }
    const result = await fetchSuggestion(body, controller.signal)
    if (pendingRef.current?.id !== requestId) return null
    pendingRef.current = null
    return result
  }

  /** Replaces the document with the sample. A normal edit, so Ctrl/Cmd+Z restores it. */
  const resetSample = () => {
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: SAMPLE_DOC },
      selection: { anchor: 0 },
      effects: clearSuggestion.of(null),
      annotations: isolateHistory.of('full'),
      scrollIntoView: true,
    })
    view.focus()
  }

  const ask = async (instruction: string) => {
    if (!view || getSuggestion(view.state)?.status === 'pending') return
    const range = readSelection(view)
    if (!range) return

    const original = view.state.sliceDoc(range.from, range.to)
    if (original.length > SUGGEST_LIMITS.selection) {
      setCommandError(`Selection is too long (max ${SUGGEST_LIMITS.selection.toLocaleString()} characters).`)
      return
    }

    const body: SuggestRequest = {
      instruction,
      selection: original,
      context: extractContext(view.state.doc.toString(), range.from, range.to),
      history: [],
    }

    // Record the target in editor state first so its range is mapped through
    // any edits made while the request is in flight. This replaces (and so
    // cancels) any existing suggestion.
    const id = nextIdRef.current++
    view.dispatch({ effects: startSuggestion.of({ id, ...range, original, instruction }) })
    setCommandError(null)

    const result = await send(id, body)
    if (!result) return

    if (result.ok) {
      const current = getSuggestion(view.state)
      view.dispatch({
        effects: resolveSuggestion.of({ requestId: id, ...result.suggestion }),
        // Collapse the selection so the inline diff isn't hidden under it.
        selection: current ? { anchor: current.to } : undefined,
      })
      setCommandOpen(false)
      view.focus()
    } else {
      view.dispatch({ effects: failRequest.of({ requestId: id, message: result.message }) })
      setCommandError(result.message)
    }
  }

  /** Asks the AI to revise the proposal on screen. The document is untouched. */
  const refine = async (instruction: string) => {
    if (!view) return
    const current = getSuggestion(view.state)
    if (current?.status !== 'ready' || current.stale || current.refinement?.status === 'loading') return

    const requestId = nextIdRef.current++
    const body = buildRefineRequest(view.state, current, instruction)
    view.dispatch({ effects: startRefinement.of({ id: current.id, requestId, instruction }) })

    const result = await send(requestId, body)
    if (!result) return
    view.dispatch({
      effects: result.ok
        ? resolveSuggestion.of({ requestId, ...result.suggestion })
        : failRequest.of({ requestId, message: result.message }),
    })
  }

  // While a request runs, the panel follows the (mapped) pending range.
  const anchor = loading ? suggestion : selection
  const showToolbar = view && anchor && (loading || commandOpen || editorFocused)

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">AI Document Editor</span>
        <p className="app-hint">
          Select text → <strong>Ask AI</strong> <kbd>{MOD}K</kbd> → review the changes → accept or refine
        </p>
        <button
          ref={historyButtonRef}
          type="button"
          className="btn btn-quiet"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-controls="version-history"
        >
          Version history{history.length > 0 && <span className="count">{history.length}</span>}
        </button>
        <button type="button" className="btn btn-quiet" onClick={resetSample} title="Undo with Ctrl/⌘+Z">
          Reset sample
        </button>
      </header>
      <div className="app-body">
        <main className="app-main">
          <Editor initialDoc={initialDoc} extensions={editorExtensions} onViewChange={setView} onUpdate={handleUpdate} />
        </main>
        {historyOpen && (
          <VersionHistory
            entries={history}
            onClose={() => {
              setHistoryOpen(false)
              historyButtonRef.current?.focus()
            }}
          />
        )}
      </div>

      {view && suggestion?.status === 'ready' && (
        <SuggestionCard
          view={view}
          suggestion={suggestion}
          // The card (and whatever in it had focus) disappears; hand focus
          // back to the editor so typing and Ctrl/Cmd+Z keep working.
          onAccept={() => {
            acceptSuggestion(view)
            view.focus()
          }}
          onReject={() => {
            rejectSuggestion(view)
            view.focus()
          }}
          onRefine={refine}
          onCancelRefine={() => view.dispatch({ effects: cancelRefinement.of(null) })}
        />
      )}

      {showToolbar && (
        <SelectionToolbar
          view={view}
          range={anchor}
          open={commandOpen || loading}
          busy={loading}
          error={commandError}
          onOpen={() => setCommandOpen(true)}
          onClose={closeCommand}
          onSubmit={ask}
        />
      )}
    </div>
  )
}
