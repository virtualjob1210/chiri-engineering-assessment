# 06: Multi-turn refinement (commit `1d585e2`)

## Prompt

````text
The tracked suggestion flow is complete and verified.
Now implement the next incremental stage: multi-turn refinement of a pending suggestion.
Please modify the project directly.
Goal:
While an AI suggestion is visible, the user should be able to give a follow-up instruction such as:
- “Make it shorter”
- “Keep the second sentence”
- “Make it more formal”
- “Add an example”
The AI should refine the current proposal without changing the document until the user accepts.
Implement:
- a small refinement input inside or directly attached to SuggestionCard
- support for the existing history field in the API contract
- request state for refinement
- replacement of the current proposal with the refined proposal when the response succeeds
- preservation of the original document text throughout the whole refinement chain
Expected flow:
original text
→ first AI proposal
→ user enters refinement instruction
→ second AI proposal
→ diff updates
→ user can refine again
→ Accept / Reject
Requirements:
- refinement must operate on the current proposal, not rewrite the original from scratch
- send the previous instruction/replacement/rationale history to the existing API
- keep the original selected text unchanged in the document
- update the visible diff against the original text
- keep the same mapped CodeMirror range
- preserve stale-range protections
- if the passage becomes stale during refinement, disable Accept
- show an inline “Refining…” state while keeping the current diff visible
- if refinement fails, keep the previous proposal visible and show the error without losing the user's work
- support Enter or Cmd/Ctrl+Enter to submit refinement
- Esc should not accidentally reject the whole suggestion while the refinement input is actively being edited unless that behavior is clearly intentional
UX:
- this should feel like editing the AI's suggestion, not opening a chatbot conversation
- do not add message bubbles
- do not add a sidebar
- keep the refinement control visually secondary to the diff
- keep Accept and Reject easy to find
Add a few small quick-refine actions if they improve the experience, such as:
- Shorter
- More formal
- Keep details
but avoid clutter.
Tests:
- add focused tests for refinement lifecycle/state
- verify history is built correctly
- verify a failed refinement preserves the previous proposal
- verify stale suggestions still cannot be accepted
- verify Accept after multiple refinement rounds applies only the latest proposal and remains undoable
Do NOT implement yet:
- per-hunk accept/reject
- version history
- multiple simultaneous suggestions
- whole-document review
When finished:
1. run npm run build
2. run npm test
3. run npm run lint
4. manually test at least one real refinement chain with OpenRouter
5. show the files changed
6. explain how refinement history is represented
7. explain how failures and stale ranges are handled
8. list anything deliberately deferred
9. do not commit until I review it
````

## Design

- **A ready suggestion keeps every round** (`{ instruction, replacement, rationale }`), oldest first. That's the same shape as the API's `history` field, so a refinement request is `{ selection: original, history: rounds, instruction }`. The original text never changes.
- **Every request has its own id** (the first ask and each refinement). A response only applies if its id is the one the suggestion is waiting on, which covers late, cancelled and replaced responses in one rule.
- **Cancellation is centralised.** Whenever the suggestion stops waiting on the request in flight (rejected, replaced, cancelled, gone stale), App aborts the network call.
- **A stale passage cancels an in-flight refinement,** since the result could never be accepted.
- **Esc in the refine field never rejects.** It cancels a running refinement, then clears the field, then returns to the editor (where Esc does reject).

## A prompt fix

Reviewing the server showed the follow-up message said *"Refine your previous replacement of the original selection"*, which could be read as "start again from the original". It now says to **revise the latest version, apply only this change, and keep everything else**. The real chain confirmed it: round 3 ("More formal") kept round 2's single-sentence structure.

## Verification with real calls

In headless Chrome with live OpenRouter, the script captured each outgoing request body:
- Three rounds: "Make clearer" → "Make it one short sentence" → "More formal".
- History grew `[]` → `[clearer]` → `[clearer, one sentence]`, and every request sent the **original** paragraph.
- The document was unchanged through all three rounds.
- A simulated server error kept Revision 3 on screen and kept the typed instruction for a retry.
- Accept applied only the latest text, and one undo restored the original.
- Typing inside the passage during a refinement marked it stale and cancelled the request.

10 new state tests (80 in total).
