# 06: Multi-turn refinement (commit `1d585e2`)

> While an AI suggestion is visible, the user should be able to give a follow-up instruction… The AI should refine the current proposal without changing the document until the user accepts… send the previous instruction/replacement/rationale history… if refinement fails, keep the previous proposal visible… Esc should not accidentally reject the whole suggestion while the refinement input is actively being edited… this should feel like editing the AI's suggestion, not opening a chatbot conversation.

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
