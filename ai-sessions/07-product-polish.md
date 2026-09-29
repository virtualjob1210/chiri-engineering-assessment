# 07: Product polish (commit `dc8040b`)

## Prompt

````text
The core product flow is now complete:
select text → ask AI → see diff → refine multiple times → accept/reject
The refinement stage is tested and working. I do not want to add more major product features.
Now do a final polish and submission-readiness pass.
Please modify the project directly.
Focus only on improvements that materially improve the evaluator's first 1–2 minutes with the app.
Please review and improve:
1. First-run experience
- Add a subtle, concise hint explaining the main workflow:
  Select text → Ask AI → review changes → accept or refine
- Make sure the sample document immediately gives the evaluator useful text to experiment with.
- Consider a small Reset sample action if it can be added cleanly.
2. Suggestion card positioning
The current card can cover the paragraph below.
Improve this without redesigning the whole editor.
Prefer a simple, reliable solution over a complex layout system.
Explain the trade-off you choose.
3. Loading, errors, and empty states
Review:
- initial suggestion loading
- refinement loading
- API errors
- stale suggestions
- identical/no-change suggestions
Make wording concise and human.
4. Accessibility and keyboard UX
Review:
- visible focus states
- button labels / aria labels where appropriate
- keyboard shortcuts
- Enter / Esc behavior
- color contrast for inserted/deleted text
Do not over-engineer accessibility, but fix obvious issues.
5. Visual consistency
Polish spacing, typography, controls, diff styling, toolbar, and suggestion card.
Keep the design minimal and professional.
Do not add a component library or Tailwind.
6. Code cleanup
Review the implementation for:
- temporary/debug code
- unused exports
- duplicated logic
- unnecessary comments
- naming inconsistencies
- avoidable complexity
Refactor only where the improvement is clear.
7. Final test pass
Run:
- npm run build
- npm test
- npm run lint
Also manually verify the complete happy path with OpenRouter:
select → ask → diff → refine → accept → undo
and:
select → ask → reject
Important scope
Do NOT add:
- per-hunk acceptance
- version history
- whole-document review
- multiple simultaneous suggestions
- authentication
- database
- streaming
- dark mode
- new infrastructure
The goal is polish, not feature growth.
When finished, show me:
1. files changed
2. UX improvements made
3. code cleanup performed
4. final build/test/lint results
5. any remaining known limitations
6. anything you intentionally decided not to change
Do not commit yet. I want to review the polish pass before the final README and submission work.
````

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
