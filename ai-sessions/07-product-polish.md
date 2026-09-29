# 07: Product polish (commit `dc8040b`)

> I do not want to add more major product features. Now do a final polish and submission-readiness pass. Focus only on improvements that materially improve the evaluator's first 1–2 minutes… first-run hint… Reset sample… the card can cover the paragraph below. Improve this without redesigning the whole editor. Prefer a simple, reliable solution… Explain the trade-off… loading, errors, empty states… accessibility and keyboard UX… visual consistency… code cleanup.

## What changed

- **First run:** a header hint (*Select text → Ask AI Ctrl+K → review the changes → accept or refine*), an undoable **Reset sample**, and a sample paragraph with deliberate grammar slips, so every quick action has an obvious target.
- **Card placement:** see the next section.
- **Errors:** raw upstream messages such as `OpenRouter timed out after 30000ms` used to reach the UI. `describeUpstreamError` now maps them to short, actionable sentences (bad key, out of credit, rate limited, timeout, network), with the details in the server log. 6 tests.
- **Accessibility:**
  - one visible focus ring for every control
  - `aria-keyshortcuts` on the buttons with shortcuts
  - the rationale announced by screen readers
  - diffs rendered as real `<del>`/`<ins>` elements, so the meaning isn't colour-only
  - contrast checked
- **Cleanup:**
  - four duplicate button styles consolidated into shared `.btn` / `.chip` / `.status` classes
  - unused exports removed
  - `submit` renamed to `ask`
  - leftover debris removed

## Card placement: the options and the choice

| Option | Problem |
|---|---|
| Put the card in the right margin | Fails at laptop widths: the margin is narrower than the card |
| Flip the card above the text | Just covers different text |
| **Reserve space in the document** ✓ | The text below moves down while a suggestion is open |

Chosen: the editor inserts an empty block, exactly the card's height (measured with a `ResizeObserver`), under the paragraph, and the card sits in it.

## Bugs the final browser run caught

The unit tests all passed, but the scripted Chrome run failed three checks:

1. **The card was placed *below* its reserved space, not in it.** CodeMirror's `lineBlockAt()` includes block widgets attached to the line, so the reserved space counted as part of the paragraph. Fix: a `textBottom()` helper that measures only the text.
2. **Undo did nothing after a keyboard Accept.** Accepting with Ctrl+Enter from the refine field unmounts the card, including the focused input. Focus fell to `<body>`, so Ctrl+Z went nowhere. Fix: Accept and Reject from the card now hand focus back to the editor.
3. **"Undo Reset sample" failed.** This one was **a bug in my test script, not the app**: it measured a line's position before scrolling it into view, so the click missed the editor. The script was fixed; the app code was not changed.

## A mistake along the way

A quoting error in one of Claude's scripted edits turned `"Couldn't"` into a bare `'` inside a single-quoted string. That broke `server/suggestHandler.ts`, and the dev server failed to reload. It was caught by the next test run and fixed, and Claude switched to direct file edits for the rest of the pass.

**Kept as-is on purpose:** the prompt, the model and the suggestion state logic ("tested and working; a polish pass shouldn't touch them"), and there's no confirm dialog on Reset (undo covers it).
