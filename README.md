# AI Document Editor

A Markdown editor where an AI co-author proposes edits as **inline tracked changes**. You select text and ask for a change. The AI's proposal appears as a word-level diff in place. You refine it as often as you like, then accept or reject it. Nothing touches your document until you accept.

Built for the Chiri engineering assessment with Claude Code as a pair-programming partner. The full development record is in [`ai-sessions/`](ai-sessions/).

## Contents

- [Quick start](#quick-start)
- [How to use it](#how-to-use-it)
- [Version history](#version-history)
- [Architecture](#architecture)
- [Engineering decisions](#engineering-decisions)
- [Trade-offs and deliberate omissions](#trade-offs-and-deliberate-omissions)
- [Known limitations](#known-limitations)
- [With more time](#with-more-time)
- [Testing](#testing)

## Quick start

**Requirements:** Node.js 20.19+ or 22.12+, and an [OpenRouter](https://openrouter.ai) API key.

```bash
npm install
cp .env.example .env      # then set OPENROUTER_API_KEY in .env
npm run dev               # open http://localhost:5173
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Your key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | no | Any OpenRouter model slug. Defaults to `anthropic/claude-sonnet-5.5` |

Both are read **server-side only**, by a small proxy running inside the Vite dev server. The key never reaches the browser bundle. Don't prefix them with `VITE_`, because that would expose them to the client.

**Cost:** a typical suggestion is about 1.5k input and 400 output tokens, roughly $0.007 with the default model. A $5 cap covers several hundred suggestions.

**Production preview:** `npm run build && npm run preview` serves the built app with the same `/api/suggest` endpoint.

## How to use it

The app opens with a sample draft that has deliberate problems (wordy, too casual, grammar slips), so you can try it straight away.

1. **Select text.** A small **✦ Ask AI** button appears under the selection.
2. **Ask.** Press `Ctrl/⌘+K` or click the button. Type an instruction, or pick a quick action: *Shorten*, *Make clearer*, *More formal*, *Fix grammar*.
3. **Review.** The proposal appears inline: deletions struck through in red, insertions in green, with a one-line rationale from the AI in a card underneath.
4. **Refine** as often as you like, with free text ("keep the second sentence") or *Shorter* / *More formal* / *Keep details*. Each revision replaces the proposal. The diff is always shown against your original text.
5. **Accept or reject.** Accept replaces only the selected text, as a single undoable step. Reject leaves the document exactly as it was.

### Keyboard shortcuts

| Keys | Where | Action |
|---|---|---|
| `Ctrl/⌘+K` | Editor, with text selected | Open the AI command panel |
| `Enter` or `Ctrl/⌘+Enter` | Command panel | Ask |
| `Esc` | Command panel | Close, or cancel a running request |
| `Ctrl/⌘+Enter` | Editor, suggestion visible | Accept |
| `Esc` | Editor, suggestion visible | Reject |
| `Enter` or `Ctrl/⌘+Enter` | Refine field | Send the refinement (`Ctrl/⌘+Enter` on an empty field accepts) |
| `Esc` | Refine field | Cancel a running refinement, then clear the field, then return to the editor. **It never rejects** |
| `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` | Editor | Undo/redo, including accepted AI edits and Reset sample |

### Guarantees

- **AI suggestions never modify the document until you accept them.** The diff is drawn as decorations over unchanged text.
- **Diffs are computed client-side** with a word-level diff. The model only returns replacement text and a rationale, never a diff.
- **Refinement preserves the original.** Every round re-sends your original selection plus the earlier proposals, and the document stays untouched until the final Accept.
- **Edits made while a suggestion is open are tracked.** Edits elsewhere shift the suggestion with the text. An edit *inside* the suggested passage marks it stale: Accept is disabled, and a request still running is cancelled.

The document autosaves to `localStorage`. **Reset sample** restores the sample text, and `Ctrl/⌘+Z` undoes that.

## Version history

**Version history** in the header opens a side panel listing every accepted AI edit, newest first. Each entry records:
- the revision number and time
- the instruction chain, e.g. *Make clearer → Make it shorter*
- the AI's rationale
- before/after text with the changes marked
- the full document right after the accept

- **Only accepts are recorded.** Rejected suggestions, failed requests, refinements you didn't accept, and normal typing never create entries. A suggestion refined three times and then accepted creates **one** entry, with the final text and the whole instruction chain.
- **It's an append-only collaboration log**, stored in `localStorage` under its own key and capped at the 50 most recent entries. It survives page reloads.
- **Undo restores the document text but does not remove history entries.** The history records what happened (you accepted this edit), not what the document currently looks like. The panel says so.
- **View-only.** There is no restore. Restoring a snapshot would silently discard any manual edits made since then, and doing that safely needs a conflict/confirm step that was out of scope.

## Architecture

```
Browser (React + CodeMirror 6)                     Vite dev server (Node)
┌──────────────────────────────────────┐          ┌─────────────────────────────────┐
│ Editor: CodeMirror owns doc + state  │          │ POST /api/suggest               │
│  └─ suggestionField: the one active  │  JSON    │  suggestPlugin  (HTTP adapter)  │
│     suggestion, its mapped range,    │ ───────▶ │  suggestHandler (validate,      │
│     diff decorations, accept/reject  │          │                  retry, errors) │
│ React: toolbar, card, history panel  │ ◀─────── │  prompt         (messages/parse)│
│ lib: diff, context, history, storage │          │  openrouter     (plain fetch)   │
└──────────────────────────────────────┘          └─────────────────────────────────┘
```

| Path | Responsibility |
|---|---|
| `src/editor/suggestionField.ts` | The single active suggestion, stored in CodeMirror state: pending/ready/refining states, range mapping, staleness, accept transaction, inline diff decorations, keyboard shortcuts |
| `src/editor/extensions.ts`, `Editor.tsx` | Prose-first CodeMirror setup (no gutters or line numbers) and a thin React wrapper |
| `src/components/` | `SelectionToolbar` (Ask AI), `SuggestionCard` (accept/reject/refine), `VersionHistory`, and `useAnchoredPosition` (pins floating UI to a text range) |
| `src/lib/` | Pure, tested logic: `diff`, `context` (bounded surrounding text), `history`, `storage`, `apiClient` |
| `server/` | The OpenRouter proxy: validation, prompt, retry, user-facing error mapping |
| `shared/` | The request/response contract and size limits, shared by client and server |

**API contract:** `POST /api/suggest` takes `{ instruction, selection, context: { heading?, before, after }, history }` and returns `{ replacement, rationale }`, or `{ error: { code, message } }`. The server is stateless: refinement history travels with each request.

## Engineering decisions

- **CodeMirror 6, not TipTap.** The user writes Markdown, so in CodeMirror the source *is* the document and AI edits are plain text replacements. Mapping AI rewrites onto a rich-text tree, and rendering tracked changes across formatting, would have consumed the time budget. The cost is a less WYSIWYG look, softened by document-style highlighting.
- **The suggestion lives in editor state, not React.** Every edit updates the suggestion's range in the same step, so staleness is decided alongside the edit itself. Accept is an ordinary CodeMirror transaction, isolated as its own undo step. React only mirrors that state for rendering.
- **The model only ever sees the selection plus bounded context:** about 1,500 characters each side, cut at a line break, plus the nearest heading. It returns replacement text, never the full document. That keeps cost down and makes "the AI rewrote my whole document" impossible by construction.
- **`diffWordsWithSpace` with a cleanup pass.** jsdiff's `diffWords` treats whitespace-only changes as equal and reports the *new* text for them. That breaks offset mapping into the original, which an experiment during development confirmed. The cleanup folds whitespace between changes into them, groups each run of changes into one deletion plus one insertion, and is tested to rebuild both texts exactly.
- **One active suggestion at a time.** This removes overlap handling entirely.
- **Proxy as a Vite plugin:** one process, one command, no CORS, no extra dependencies. The handler itself doesn't depend on Vite, so moving it to Express or a serverless function would be a small adapter.
- **Few dependencies.** CodeMirror packages, `diff`, React, and Vitest. There's no UI kit, no state library, no schema library, and no LLM SDK (it's a single `fetch`). `markdown()` from `lang-markdown` is avoided because it eagerly bundles HTML/CSS/JS parsers; that cut the bundle from 720 kB to 535 kB.
- **Every request has its own id.** Responses for cancelled, replaced or stale requests are ignored, and the network call is aborted. The server then aborts the OpenRouter call, so abandoned requests stop costing tokens.

## Trade-offs and deliberate omissions

- **The card reserves space in the document.** While a suggestion is open, an empty block of the card's height is inserted under the paragraph, so the card never covers text; the text below moves down temporarily. I chose this over a margin layout, which fails at laptop widths, and over flipping the card above the text, which just covers different text.
- **No streaming.** The diff needs the complete proposal, and suggestions take about 2–4 s behind clear loading states.
- **No chat panel.** Refinement happens on the suggestion itself, per the brief ("not a chatbot in a sidebar").
- **No ghost-text autocomplete.** It pushes toward "the AI writes the document", which the brief explicitly avoids.
- **Not built:** auth, a database, Docker, real-time multi-user editing, per-hunk accept, whole-document review, multiple simultaneous suggestions, dark mode. Some were explicitly out of scope; the rest didn't fit a 4–6 hour budget.

## Known limitations

- **Accept and history:** undoing an Accept restores the text but not the suggestion card, and history entries aren't removed by undo (by design, see above).
- **Multi-line insertions** render inline (wrapped), not as separate block lines. This is fine for prose edits but less clear for restructured lists.
- **Refinements only see bounded context.** The model sees the selection, bounded surrounding context and its own earlier proposals, not the whole document.
- **Storage:** history stores a full document copy per entry. With very large documents, 50 entries could approach the ~5 MB `localStorage` limit, and saving would then quietly stop.
- **Small screens:** not tuned for phones; the header hint hides below 760 px.
- **The API only exists under `vite dev` / `vite preview`.** There's no standalone production server.

## With more time

- **Per-hunk accept/reject:** the diff segments already exist, so this is mostly UI.
- **Restore from history** with a preview of what would be discarded.
- **"Review whole document":** multiple anchored suggestions, each quoting its exact target text.
- **Streaming** the proposal into the pending area, with a diff once it completes.
- **Block-level rendering** for multi-paragraph insertions.
- **Storage and undo:** store diffs instead of full snapshots in history, and bring back the suggestion card on undo.
- **Testing:** an end-to-end suite (e.g. Playwright) based on the scripted browser checks used during development.

## Testing

```bash
npm test          # Vitest: 97 tests
npm run lint      # oxlint
npm run build     # type-check (tsc -b) + production build
```

The tests cover the pure and state logic, with no browser or network needed:

| Test file | Covers |
|---|---|
| `server/*.test.ts` | Request validation, prompt building, reply parsing, retry, error mapping |
| `src/lib/diff.test.ts` | Diff segments, including exact reconstruction of both texts |
| `src/lib/context.test.ts` | Selection trimming, nearest heading, bounded context |
| `src/lib/storage.test.ts`, `history.test.ts` | Persistence, ordering, cap, and which transactions create history entries |
| `src/editor/suggestionField.test.ts` | Suggestion lifecycle, range mapping through edits, staleness, refinement, accept + undo |

The UI flows (select → ask → diff → refine → accept → undo, reject, stale, errors, history across reload) were checked in headless Chrome against the real OpenRouter API during development. That scripted testing is described in `ai-sessions/`; the scripts themselves aren't part of the repo.
