import type { ViewUpdate } from '@codemirror/view'
import { useState } from 'react'
import { Editor } from './editor/Editor.tsx'
import { autosave } from './editor/extensions.ts'
import { loadDocument, saveDocument } from './lib/storage.ts'
import { SAMPLE_DOC } from './sampleDoc.ts'

// Created once: the editor reads its extensions only at mount.
const editorExtensions = [autosave((doc) => saveDocument(doc))]

export default function App() {
  const [initialDoc] = useState(() => loadDocument() ?? SAMPLE_DOC)
  const [selectedChars, setSelectedChars] = useState(0)

  const handleUpdate = (update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged) return
    const { from, to } = update.state.selection.main
    setSelectedChars(to - from)
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">AI Document Editor</span>
        <span className="app-status" aria-live="polite">
          {selectedChars > 0 ? `${selectedChars} characters selected` : 'Autosaves in this browser'}
        </span>
      </header>
      <main className="app-main">
        <Editor initialDoc={initialDoc} extensions={editorExtensions} onUpdate={handleUpdate} />
      </main>
    </div>
  )
}
