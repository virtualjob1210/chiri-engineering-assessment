# 04: Selection-aware AI command (commit `433c7d5`)

## Prompt

````text
The Markdown editor foundation is complete and reviewed.
Now implement the next incremental stage: selection-aware AI command entry, but do not build suggestion diffs yet.
Please implement this directly in the project.
Goal:
When the user selects text in CodeMirror, they should be able to invoke a small contextual AI command UI and submit an instruction for that exact selection.
Implement:
- src/components/SelectionToolbar.tsx
- src/lib/context.ts
- any minimal changes needed in App.tsx, Editor.tsx, or editor extensions
- the client-side API caller if needed, but keep the response handling minimal for now
UX requirements:
- show a subtle contextual action when non-empty text is selected
- support Ctrl+K and Cmd+K to open the AI command UI
- position the command UI near the selected text, not in a permanent sidebar
- include a free-text instruction field
- include a few quick actions:
  - Shorten
  - Make clearer
  - More formal
  - Fix grammar
- Esc closes the UI
- Ctrl+Enter / Cmd+Enter submits
- do not allow submission with an empty selection
- extract bounded context around the selection for the future API call
For this stage, when the user submits:
- call the existing POST /api/suggest
- show a simple temporary loading state
- store/log the returned { replacement, rationale }
- it is acceptable to show the raw returned suggestion in a minimal temporary panel or debug area
Do NOT implement yet:
- inline diff rendering
- tracked changes
- accept/reject
- refinement
- per-hunk actions
- version history
Keep the goal narrow: prove the flow
select text → open command → give instruction → API request → receive suggestion
Engineering requirements:
- keep CodeMirror as the source of truth for selection/ranges
- avoid unnecessary React re-renders
- keep context extraction in a pure function
- add focused tests for context.ts
- preserve the selected range and original text when the request is submitted
- handle request errors cleanly
When finished:
1. run npm run build
2. run npm test
3. run npm run lint
4. show the files changed
5. explain the main UX and technical decisions
6. tell me what is deliberately left for the diff stage
7. do not commit these changes yet
````

## Decisions

- **A hint, then a panel.** Selecting text only shows a small "✦ Ask AI" button, so normal editing isn't interrupted. Clicking it, or Ctrl/⌘+K, opens the panel with the input focused.
- **Selections are trimmed.** A drag or triple-click often grabs the line break, and models drop it, which would create a spurious diff. `trimRange` excludes leading/trailing whitespace; whitespace-only selections count as empty.
- **Bounded context** (`extractContext`, a pure function with 12 tests): about 1,500 characters each side, cut back to a line break, plus the nearest heading.
- **Shared limits.** Size limits moved to `shared/limits.ts`, so client and server use the same numbers instead of copies.
- **Ctrl/⌘+K always consumes the key,** so the browser's own Ctrl+K (focus search bar) never fires while writing.
- **Few re-renders.** The toolbar's position is written straight to the DOM on scroll, and the selection is only stored when its range actually changes.

## Problems found and fixed

- **The selection disappeared.** A headless-browser screenshot showed that once the panel's input took focus, the browser stopped highlighting the selected text, so the user couldn't see what they were asking about. Fix: CodeMirror's `drawSelection()`, which keeps a softer highlight while the editor is unfocused.
- **Headless Edge was unreliable.** Its process kept being killed a few seconds after launch on this machine. The same flow was later verified in headless Chrome.
- **A process mistake.** A cleanup command, `taskkill /IM msedge.exe`, force-closed *every* Edge process on the machine, not just the test browser. Claude reported it to me immediately. From then on it only stopped browsers by the exact process id it had started.

## Verification

The scripted browser run confirmed:
- Ctrl+K with no selection does nothing.
- Drag-selecting shows the hint.
- Ctrl+K opens the panel with focus in the input.
- An empty instruction doesn't submit.
- Ctrl+Enter submits, and with no key configured, the missing-key error appears inline.
