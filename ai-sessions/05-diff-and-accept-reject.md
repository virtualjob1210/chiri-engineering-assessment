# 05: Tracked-change diffs, accept/reject (commit `5553822`)

> Replace the temporary debug panel with a suggestion that is visually anchored to the selected text… compute the diff locally… word-level diffing… keep the suggestion anchored to the original CodeMirror range… map the suggestion range through unrelated editor changes… if the user edits inside the suggested range, mark the suggestion as stale and disable Accept… Accept should be a normal CodeMirror transaction so Ctrl/Cmd+Z can undo it… Cmd/Ctrl+Enter → Accept, Esc → Reject.

## An experiment that changed the diff algorithm

Before writing `diff.ts`, Claude ran jsdiff on sample pairs and checked whether the original text could be rebuilt exactly from each result.
- **`diffWords` failed** on whitespace-only changes. It treats them as equal and returns the *new* text, so offsets into the original drift, and deletions would be highlighted on the wrong characters.
- **Chosen:** `diffWordsWithSpace` plus a cleanup pass. Whitespace between two changes is folded into both sides, each run of changes becomes one deletion followed by one insertion, and shared trailing whitespace goes back to unchanged text.
- The tests check exact reconstruction of both texts for markup changes, whitespace-only changes, full rewrites, deletion to empty, and insertion from empty.

## Architecture

- **The suggestion lives in CodeMirror state,** not React. It's stored as "pending" *before* the request goes out, so edits made during the 3–7 s wait shift it with the text. That fixed a gap known since stage 04.
- **Mapping rule:** an edit outside the range shifts it; an edit that overlaps it or inserts inside it marks it stale for good. Typing right at either edge doesn't join the range.
- **Accept** replaces exactly the suggestion's range, isolated as its own undo step. It checks both "not stale" *and* "the text currently in the range still exactly matches the original". It's tested with CodeMirror's real `undo` command, without a DOM.
- **Rendering:** deletions are highlighted over the real text, and insertions are displayed text that isn't part of the document. The document is never modified before Accept.
- 14 state tests, including "a response for a replaced request is ignored".

## First real AI suggestion

My `.env` key was in place by now. A direct request returned **200 in 7.2 s**. The browser run (switched to headless Chrome) then confirmed the full flow:
- a diff of 5 deletions and 5 insertions for "More formal"
- an unrelated edit leaves the suggestion acceptable
- Ctrl+Enter accepts; Ctrl+Z undoes the accept alone, then the earlier edit, restoring the original exactly
- an edit inside the text marks it stale; Ctrl+Enter then does nothing, and Esc clears it

An honest note: one check in the test script ("doc unchanged while suggesting") was written wrongly and always passed. It was flagged as meaningless in the report rather than counted.

## Deferred (and later addressed or kept)

- **The card covering the paragraph below:** fixed in stage 07.
- **Undo after Accept doesn't bring the suggestion back:** kept as a known limitation.
