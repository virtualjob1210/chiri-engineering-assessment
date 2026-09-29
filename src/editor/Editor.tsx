// Thin React wrapper around a CodeMirror EditorView.
// React only mounts and destroys the view; CodeMirror owns the document and
// selection. Parents get the live view (for dispatching transactions and
// reading coordinates) and every ViewUpdate (for tracking doc/selection).

import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { documentExtensions } from './extensions.ts'

interface EditorProps {
  /** Document at mount. Later changes are ignored; dispatch to the view instead. */
  initialDoc: string
  /** Extra extensions at mount (e.g. autosave, suggestion state). */
  extensions?: Extension[]
  /** Called with the view once mounted, and with null when destroyed. */
  onViewChange?: (view: EditorView | null) => void
  /** Called for every view update (doc, selection, focus, viewport). */
  onUpdate?: (update: ViewUpdate) => void
}

export function Editor({ initialDoc, extensions = [], onViewChange, onUpdate }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  // Keep the latest callbacks in refs so the view is never rebuilt because a
  // parent passed a new function identity.
  const onUpdateRef = useRef(onUpdate)
  const onViewChangeRef = useRef(onViewChange)
  useEffect(() => {
    onUpdateRef.current = onUpdate
    onViewChangeRef.current = onViewChange
  })

  // Mount once. initialDoc/extensions are read only at creation by design.
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          documentExtensions(),
          extensions,
          EditorView.updateListener.of((update) => onUpdateRef.current?.(update)),
        ],
      }),
    })
    onViewChangeRef.current?.(view)
    view.focus()

    return () => {
      onViewChangeRef.current?.(null)
      view.destroy()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once, see above
  }, [])

  return <div ref={hostRef} className="editor-host" />
}
