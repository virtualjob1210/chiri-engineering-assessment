# 04: Selection-aware AI command (commit `433c7d5`)

> When the user selects text in CodeMirror, they should be able to invoke a small contextual AI command UI… Ctrl+K and Cmd+K… position the command UI near the selected text, not in a permanent sidebar… quick actions: Shorten, Make clearer, More formal, Fix grammar… Esc closes… Ctrl+Enter submits… extract bounded context… For this stage… show the raw returned suggestion in a minimal temporary panel… Do NOT implement inline diff rendering, tracked changes, accept/reject, refinement.

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
