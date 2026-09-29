import type { EditorView, ViewUpdate } from '@codemirror/view'
import { useRef, useState } from 'react'
import type { SuggestRequest } from '../shared/api.ts'
import { SUGGEST_LIMITS } from '../shared/limits.ts'
import { SelectionToolbar } from './components/SelectionToolbar.tsx'
import { SuggestionCard } from './components/SuggestionCard.tsx'
import { Editor } from './editor/Editor.tsx'
import { aiCommandKeymap, autosave } from './editor/extensions.ts'
import {
  acceptSuggestion,
  clearSuggestion,
  getSuggestion,
  rejectSuggestion,
  resolveSuggestion,
  startSuggestion,
  suggestionExtension,
  type Suggestion,
} from './editor/suggestionField.ts'
import { fetchSuggestion } from './lib/apiClient.ts'
import { extractContext, trimRange, type TextRange } from './lib/context.ts'
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
  // The in-flight request, if any. A ref because it's only read in callbacks.
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

  const handleUpdate = (update: ViewUpdate) => {
    const next = getSuggestion(update.state)
    if (next !== getSuggestion(update.startState)) {
      setSuggestion(next)
      // Pending suggestion rejected or replaced: stop paying for the request.
      if (pendingRef.current && next?.id !== pendingRef.current.id) {
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
    // Moving the selection dismisses an idle command panel.
    if ((update.selectionSet || update.docChanged) && !pendingRef.current) {
      setCommandOpen(false)
      setCommandError(null)
    }
  }

  const closeCommand = () => {
    if (view && pendingRef.current) rejectSuggestion(view) // cancels via handleUpdate
    setCommandOpen(false)
    setCommandError(null)
    view?.focus()
  }

  const submit = async (instruction: string) => {
    if (!view || pendingRef.current) return
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
    // any edits made while the request is in flight.
    const id = nextIdRef.current++
    view.dispatch({ effects: startSuggestion.of({ id, ...range, original, instruction }) })
    const controller = new AbortController()
    pendingRef.current = { id, controller }
    setCommandError(null)

    const result = await fetchSuggestion(body, controller.signal)
    if (pendingRef.current?.id !== id) return // cancelled or superseded
    pendingRef.current = null

    if (result.ok) {
      const { replacement, rationale } = result.suggestion
      const current = getSuggestion(view.state)
      view.dispatch({
        effects: resolveSuggestion.of({ id, replacement, rationale }),
        // Collapse the selection so the inline diff isn't hidden under it.
        selection: current ? { anchor: current.to } : undefined,
      })
      setCommandOpen(false)
      view.focus()
    } else {
      view.dispatch({ effects: clearSuggestion.of(null) })
      if (!result.aborted) setCommandError(result.message)
    }
  }

  // While a request runs, the panel follows the (mapped) pending range.
  const anchor = loading ? suggestion : selection
  const showToolbar = view && anchor && (loading || commandOpen || editorFocused)

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">AI Document Editor</span>
        <span className="app-status" aria-live="polite">
          {selection ? `${selection.to - selection.from} characters selected` : 'Autosaves in this browser'}
        </span>
      </header>
      <main className="app-main">
        <Editor initialDoc={initialDoc} extensions={editorExtensions} onViewChange={setView} onUpdate={handleUpdate} />
      </main>

      {view && suggestion?.status === 'ready' && (
        <SuggestionCard
          view={view}
          suggestion={suggestion}
          onAccept={() => acceptSuggestion(view)}
          onReject={() => rejectSuggestion(view)}
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
          onSubmit={submit}
        />
      )}
    </div>
  )
}
