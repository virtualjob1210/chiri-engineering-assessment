import type { EditorView, ViewUpdate } from '@codemirror/view'
import { useRef, useState } from 'react'
import type { SuggestRequest, SuggestResponse } from '../shared/api.ts'
import { SUGGEST_LIMITS } from '../shared/limits.ts'
import { SelectionToolbar } from './components/SelectionToolbar.tsx'
import { SuggestionDebugPanel } from './components/SuggestionDebugPanel.tsx'
import { Editor } from './editor/Editor.tsx'
import { aiCommandKeymap, autosave } from './editor/extensions.ts'
import { fetchSuggestion } from './lib/apiClient.ts'
import { extractContext, trimRange, type TextRange } from './lib/context.ts'
import { loadDocument, saveDocument } from './lib/storage.ts'
import { SAMPLE_DOC } from './sampleDoc.ts'

/** Snapshot of what the user asked about, frozen at submit time. */
interface SuggestionTarget extends TextRange {
  original: string
  instruction: string
}

type RequestState =
  | { status: 'idle' }
  | { status: 'loading'; target: SuggestionTarget }
  | { status: 'error'; message: string }
  | { status: 'done'; target: SuggestionTarget; suggestion: SuggestResponse }

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
  const [request, setRequest] = useState<RequestState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  // Created once: the editor reads its extensions only at mount. State
  // setters are stable, so capturing them here is safe.
  const [editorExtensions] = useState(() => [
    autosave((doc) => saveDocument(doc)),
    aiCommandKeymap((v) => {
      if (readSelection(v)) setCommandOpen(true)
    }),
  ])

  const loading = request.status === 'loading'

  const handleUpdate = (update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged && !update.focusChanged) return
    const next = readSelection(update.view)
    setSelection((prev) => (sameRange(prev, next) ? prev : next))
    setEditorFocused(update.view.hasFocus)
    // Moving the selection dismisses an open (idle) command; an in-flight
    // request keeps its own snapshot and stays put.
    if ((update.selectionSet || update.docChanged) && !loading) {
      setCommandOpen(false)
      if (request.status === 'error') setRequest({ status: 'idle' })
    }
  }

  const closeCommand = () => {
    abortRef.current?.abort()
    abortRef.current = null
    if (request.status !== 'done') setRequest({ status: 'idle' })
    setCommandOpen(false)
    view?.focus()
  }

  const submit = async (instruction: string) => {
    if (!view || loading) return
    const range = readSelection(view)
    if (!range) return

    const { state } = view
    const original = state.sliceDoc(range.from, range.to)
    if (original.length > SUGGEST_LIMITS.selection) {
      setRequest({
        status: 'error',
        message: `Selection is too long (max ${SUGGEST_LIMITS.selection.toLocaleString()} characters).`,
      })
      return
    }

    const target: SuggestionTarget = { ...range, original, instruction }
    const body: SuggestRequest = {
      instruction,
      selection: original,
      context: extractContext(state.doc.toString(), range.from, range.to),
      history: [],
    }

    const controller = new AbortController()
    abortRef.current = controller
    setRequest({ status: 'loading', target })

    const result = await fetchSuggestion(body, controller.signal)
    if (abortRef.current !== controller) return // cancelled or superseded
    abortRef.current = null

    if (result.ok) {
      console.info('[suggest]', { target, suggestion: result.suggestion })
      setRequest({ status: 'done', target, suggestion: result.suggestion })
      setCommandOpen(false)
      view.focus()
    } else if (!result.aborted) {
      setRequest({ status: 'error', message: result.message })
    }
  }

  // While loading, anchor to the frozen snapshot, not the live selection.
  const anchor = loading ? request.target : selection
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

      {showToolbar && (
        <SelectionToolbar
          view={view}
          range={anchor}
          open={commandOpen || loading}
          busy={loading}
          error={request.status === 'error' ? request.message : null}
          onOpen={() => setCommandOpen(true)}
          onClose={closeCommand}
          onSubmit={submit}
        />
      )}

      {request.status === 'done' && (
        <SuggestionDebugPanel
          instruction={request.target.instruction}
          original={request.target.original}
          suggestion={request.suggestion}
          onDismiss={() => setRequest({ status: 'idle' })}
        />
      )}
    </div>
  )
}
