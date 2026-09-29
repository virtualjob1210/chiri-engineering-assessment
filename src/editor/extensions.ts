// CodeMirror configuration for a prose-first Markdown editor.
// Deliberately omits IDE features (line numbers, gutters, folding,
// autocomplete, active-line highlight) that basicSetup would bring in.

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdownKeymap, markdownLanguage, pasteURLAsLink } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.9em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.45em', fontWeight: '700', lineHeight: '1.35' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '600' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--muted)', textDecoration: 'underline' },
  { tag: tags.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em', backgroundColor: 'var(--code-bg)' },
  // Markup punctuation (#, *, >, -, `) recedes so the prose reads first.
  { tag: [tags.processingInstruction, tags.labelName, tags.contentSeparator], color: 'var(--markup)' },
])

const documentTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '17px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-prose)',
    lineHeight: '1.7',
  },
  '.cm-content': {
    width: '100%',
    maxWidth: '72ch',
    margin: '0 auto',
    padding: '48px 24px 30vh',
    caretColor: 'var(--text)',
  },
  '.cm-line': {
    padding: '0',
  },
  // Drawn selection (see drawSelection below) stays visible, softer, when
  // focus moves to the AI command panel.
  '.cm-selectionBackground': {
    background: 'var(--selection-blur)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'var(--selection)',
  },
  '.cm-placeholder': {
    color: 'var(--muted)',
  },
})

/**
 * Persists the document after typing pauses. Flushes pending changes when the
 * page is hidden or the editor is destroyed so the last keystrokes aren't lost.
 */
export function autosave(save: (doc: string) => void, delayMs = 400): Extension {
  return ViewPlugin.define((view) => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const flush = () => {
      if (timer === undefined) return
      clearTimeout(timer)
      timer = undefined
      save(view.state.doc.toString())
    }
    window.addEventListener('pagehide', flush)

    return {
      update(update: ViewUpdate) {
        if (!update.docChanged) return
        clearTimeout(timer)
        timer = setTimeout(flush, delayMs)
      },
      destroy() {
        flush()
        window.removeEventListener('pagehide', flush)
      },
    }
  })
}

/**
 * Ctrl/Cmd+K invokes the AI command. Always consumes the key, even with an
 * empty selection, so the browser's own Ctrl+K (focus search bar) never fires
 * while writing.
 */
export function aiCommandKeymap(onInvoke: (view: EditorView) => void): Extension {
  return keymap.of([
    {
      key: 'Mod-k',
      preventDefault: true,
      run: (view) => {
        onInvoke(view)
        return true
      },
    },
  ])
}

/** Base extensions for the document editor. */
export function documentExtensions(): Extension[] {
  return [
    history(),
    // markdownKeymap first so Enter continues lists before the default newline.
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    // GFM language (tables, strikethrough, task lists) used directly rather than
    // via markdown(), which eagerly bundles HTML/CSS/JS parsers for inline HTML.
    markdownLanguage,
    pasteURLAsLink,
    syntaxHighlighting(markdownStyle),
    // Keeps the selection visible while focus is in the AI command panel.
    drawSelection(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Document editor' }),
    placeholder('Start writing in Markdown…'),
    documentTheme,
  ]
}
