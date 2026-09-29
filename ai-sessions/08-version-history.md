# 08: Version history (commit `ebce23b`)

## How this feature came about

After the polish pass I asked whether the app supported the brief's idea of *"version history showing how the document evolved with AI help"*. Claude answered plainly that **it did not**. It pointed out what already existed (undo, and revisions inside one suggestion) and sketched what a view-only log would take. I then asked for it:

> Every time the user accepts an AI suggestion, create a new history entry… a small Version history action in the header… lists accepted AI revisions, newest first… Persist in localStorage… separate key… a sensible cap… Do not create entries for rejected suggestions, failed requests, refinements that were not accepted, normal manual typing… Keep version history outside CodeMirror editor state… First implement history as view-only… Ctrl/Cmd+Z should still undo the accepted text exactly as it does today… if that creates a semantic mismatch, explain it and propose the simplest honest behavior.

## The key design point

**Accept can happen three ways:** Ctrl/⌘+Enter handled inside CodeMirror's keymap, the Accept button, and Ctrl+Enter in the refine field. Hooking only the button handler in React would have missed the keyboard path.

Instead, `acceptTransaction`, which every path uses, tags the transaction with a CodeMirror annotation carrying the accepted suggestion. App records an entry whenever it sees that tag. The result:
- **One integration point for all three paths.** History stays in React state and localStorage, outside editor state, as I asked.
- **Nothing else can create an entry.** Rejects, failures, un-accepted refinements, typing, and undo/redo transactions never carry the tag.

## Other decisions

- **One entry per accept,** using the *final* proposal. Claude added an `instructions[]` field (the whole chain, e.g. *Make clearer → Make it shorter*) beside the requested final `instruction`, and flagged it as an addition. The final instruction alone ("Make it shorter") says little about how the text evolved.
- **Undo doesn't remove entries.** The history is an **append-only log of accept events**, not a mirror of the document. Removing entries on undo would mean re-adding them on redo, which means tracking history through the undo stack. The panel says so in one line.
- **Restore isn't built.** Replacing the document with a snapshot is technically small, but it silently discards every manual edit made since. Doing it safely needs a preview/confirm step, which I had ruled out.
- **Stored under its own key** (`ai-doc-editor:history`), capped at the 50 most recent entries, with every entry validated on load (corrupt data → empty history).
- **Known risk, stated:** each entry stores a full document copy, which could approach the localStorage limit with very large documents.

## Tests and verification

**11 tests.** They include integration tests with real editor transactions: a reject, a failed request, typing, a 3-round refinement recorded once, and undo creating no entry.

**Browser run with live OpenRouter:**
- empty state, and keyboard focus in and out of the panel
- a refined accept creates one entry, and the stored document matches the editor
- **page reload keeps the history**
- **a rejected suggestion adds nothing**
- a second accept is listed first
- undo restores the text and history keeps both entries

**A problem along the way:** the first run failed because the dev server from the previous session had stopped. It was restarted, and the run repeated.

Opening the panel narrows the editor, so floating UI now also repositions when the editor resizes (a `ResizeObserver`), not only on window resize.
