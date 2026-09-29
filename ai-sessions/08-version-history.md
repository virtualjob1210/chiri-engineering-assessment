# 08: Version history (commit `ebce23b`)

## Prompt 1

After the polish pass, I asked:

````text
Does this project support "Version history showing how the document evolved with AI help" feature?
````

Claude answered plainly that **it did not**. It pointed out what already existed (undo, and revisions inside one suggestion) and sketched what a view-only log would take.

## Prompt 2

````text
The core editor and AI collaboration flow are complete.
I now want to add one final feature from the assessment ideas:
Version history showing how the document evolved with AI help.
Please implement this directly in the existing project, but keep it lightweight and consistent with the current architecture.
Product goal
Every time the user accepts an AI suggestion, create a new history entry/snapshot.
The user should be able to open a small Version History panel from the top navigation/header and inspect how the document evolved through accepted AI edits.
History entry
Each accepted AI suggestion should record:
- unique id
- timestamp
- AI instruction that led to the accepted suggestion
- rationale
- original selected text
- accepted replacement text
- full document content after the accept
- revision number / sequence number
Example:
interface VersionEntry {
  id: string
  createdAt: string
  revision: number
  instruction: string
  rationale: string
  originalText: string
  replacementText: string
  document: string
}

UX
Add a small Version history action in the app header/navigation.
Clicking it should open a side panel, drawer, or popover that lists accepted AI revisions, newest first.
Each item should show:
- Revision N
- timestamp
- instruction
- short summary/rationale
When the user opens one history entry, show:
- before/after text for that accepted suggestion
- the AI rationale
- optionally a compact diff using the existing diff utilities
Keep the visual language consistent with the existing suggestion card.
Do not turn this into a chatbot or a complex timeline.
Persistence
Persist version history in localStorage, similar to the current document persistence.
Use a separate key from the current document.
History should survive page refreshes.
Add a sensible cap, for example the most recent 50 accepted AI revisions.
Integration point
The history entry should be created only when an AI suggestion is actually accepted.
Do not create entries for:
- rejected suggestions
- failed requests
- refinements that were not accepted
- normal manual typing
If the user refines a suggestion multiple times and accepts Revision 3, create only one history entry using the final accepted proposal, but preserve the final instruction/rationale that led to it.
Architecture
Prefer:
- src/lib/history.ts
- src/lib/history.test.ts
- src/components/VersionHistory.tsx
Make only minimal changes to:
- App.tsx
- the suggestion accept flow
- styles
Keep version history outside CodeMirror editor state unless there is a strong reason not to.
Restore behavior
First implement history as view-only.
Do not add restore/revert yet unless it is clearly safe and very small.
I want to avoid complex conflicts between old snapshots and current manual edits.
If you think restore is worth adding, explain the trade-off before implementing it.
Important behavior
When an AI suggestion is accepted:
1. capture the document before the accept if needed
2. apply the existing CodeMirror accept transaction
3. capture the resulting full document
4. create the version history entry
5. persist it
Ensure this does not break the current undo behavior.
Ctrl/Cmd+Z should still undo the accepted text exactly as it does today.
History itself does not need to disappear when the editor undo command is used; if that creates a semantic mismatch, explain it and propose the simplest honest behavior.
Tests
Add focused tests for:
- creating history entries
- persistence/load
- ordering
- maximum history size
- rejected suggestions not creating history
- multiple refinements creating only one accepted history entry
Scope
Do not add:
- backend/database storage
- multi-user history
- branching versions
- autosaved manual-edit snapshots
- complex restore conflict handling
This feature should demonstrate how the document evolved through accepted AI collaboration, not become a full version-control system.
When finished
Please:
1. run npm run build
2. run npm test
3. run npm run lint
4. manually test:
   - accept AI suggestion
   - open version history
   - refresh browser
   - confirm history remains
   - reject another suggestion and confirm no new history entry
5. show me the files changed
6. explain where history is recorded in the accept flow
7. explain how persistence works
8. explain any interaction with undo/redo
9. list anything deliberately deferred
10. do not commit until I review it
````

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
