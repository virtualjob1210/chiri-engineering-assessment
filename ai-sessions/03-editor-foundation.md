# 03: Markdown editor foundation (commit `6f011c6`)

## Prompt

````text
The OpenRouter plumbing is complete, reviewed, tested, and committed.
Let's move to the next incremental stage: build the Markdown editor foundation only.
Please implement the changes directly in the project.
Use CodeMirror 6 and create:
- src/editor/Editor.tsx
- src/editor/extensions.ts
- src/sampleDoc.ts
- src/lib/storage.ts
- any minimal changes needed in App.tsx and styles.css
For this stage, I want:
- a clean browser-based Markdown editor
- Markdown syntax support
- a document-like appearance rather than an IDE/code-editor appearance
- no line numbers or programming-oriented UI
- a useful sample Markdown document on first launch
- document persistence using localStorage
- normal undo/redo behavior
- the editor to fill the main working area cleanly
Keep the React wrapper around CodeMirror thin and expose the editor state/selection in a way that will make the next AI-selection stage easy to implement.
Do not implement yet:
- OpenRouter calls from the UI
- AI toolbar
- Cmd/Ctrl+K
- suggestion state
- diff rendering
- accept/reject
- refinement
- preview pane
- version history
Keep this stage deliberately small.
Add focused tests only where they provide value, especially for storage.ts; don't create tests just to increase test count.
When finished:
1. run npm run build
2. run npm test
3. run npm run lint
4. show me the files changed
5. explain any important implementation decisions
6. tell me what you deliberately left for the next stage
Do not commit these editor changes yet. I want to review them first.
````

## Decisions

- **Thin wrapper.** React only creates and destroys the `EditorView`, and CodeMirror owns the document and selection. Parents get `onViewChange(view)` and `onUpdate(update)`. Callbacks are held in refs, so the editor is never rebuilt on re-render.
- **Autosave is a CodeMirror extension, not React state.** It saves 400 ms after typing stops, and flushes on `pagehide` and on unmount. There's no React re-render per keystroke.
- **Storage fails safely.** A missing or throwing `localStorage` (private mode, full quota) means "not saved", never a crash. A deliberately emptied document stays empty after reload instead of the sample coming back. Five storage tests.
- **Prose look:** hand-picked extensions instead of `basicSetup`, a serif ~72-character column, larger headings, and dimmed Markdown punctuation (`#`, `**`).
- **The sample document is a deliberately rough draft** (wordy, too casual, thin sections), so the AI stage has something worth improving.

## A finding that changed the implementation

The build warned about a **720 kB bundle**. Claude traced it to `markdown()` from `@codemirror/lang-markdown`, which always bundles the full HTML, CSS and JavaScript parsers just to highlight inline HTML. It switched to using `markdownLanguage`, `markdownKeymap` and `pasteURLAsLink` directly, which kept the same behaviour and brought the bundle down to **535 kB**. The remaining warning, React plus CodeMirror, was left visible rather than silenced.

## Verification

A headless Edge screenshot confirmed the layout. Typing, undo and reload were left for me to check by hand, since the headless browser couldn't type in this setup.
