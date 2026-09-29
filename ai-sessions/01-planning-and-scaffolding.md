# Session 01: Planning, scaffolding, API plumbing

**Tool:** Claude Code (Claude Opus 5.5) in VS Code
**Goal:** Turn the assessment brief into a focused 4–6 hour MVP, scaffold the project, and build the OpenRouter proxy.

---

## Step 1: Requirements analysis and MVP scope

### Prompt (summarised)

> Act as my senior pair-programming partner, not just generate the entire project. Analyse the requirements and define a focused MVP I can build in 4–6 hours: summarise the requirements, separate required from optional, identify the most important workflow, recommend a minimal architecture, identify the biggest technical and UX risks, suggest what to leave out, and give a staged plan. **Do not write implementation code yet.**

The assessment PDF was attached.

### Key outputs

**Core insight:** the hardest requirement is #5, that it should *feel collaborative*. The brief names two failure modes to avoid: "a chatbot in a sidebar" and "something that completes the whole document". Everything else supports that.

**The workflow to get right:**

> Select text → invoke AI → type or pick an instruction → see an inline tracked-change diff with a one-line rationale → accept / reject / "refine: make it punchier" → the diff updates in place → accept → keep writing.

**Required vs optional:**

| MVP | Stretch |
|---|---|
| Markdown editor, seeded sample doc | Slash commands / command palette |
| "Ask AI" on a selection, free-text instruction | Split-pane before/after |
| Quick actions (improve, shorten, tone) | "Review whole doc" with multiple anchored edits |
| Inline word-level diff | Version history |
| Accept / reject | Streaming |
| Refine by replying to a suggestion (multi-turn) | Per-hunk accept |
| One-line AI rationale per suggestion | |

### Decision: CodeMirror 6 over TipTap

The brief suggests TipTap, but we chose **CodeMirror 6**.

- **Why:**
  - The brief says the user writes *Markdown*. In CodeMirror the markdown source *is* the document, so AI suggestions are plain text diffs, which are simple and reliable.
  - With TipTap, the AI's markdown rewrite would have to be mapped back onto a ProseMirror node tree, and tracked changes rendered across marks and blocks. That's a rabbit hole in a 6-hour budget.
  - CodeMirror's `StateField` and position mapping handle "the user edits while a suggestion is pending" almost for free.
- **Cost:** it looks less like Google Docs. We offset that with document-style markdown highlighting.

### Decision: constrain what the AI can touch

- The model receives the selection plus bounded context, **never the whole document**. That controls cost, and it makes "rewrite the whole doc" impossible by construction.
- The model returns structured JSON `{ replacement, rationale }`, not prose.
- The diff is computed **client-side**. The model doesn't produce diffs.

### Risks identified

- **Stale anchors:** the user edits while a request is in flight. Map positions through transactions, and mark the suggestion stale if its range is touched.
- **Model output drift:** code fences, invalid JSON. Use strict prompting, JSON mode, a defensive parser, and one retry.
- **Noisy diffs:** character-level diffs are unreadable. Use word-level diffs.
- **Feeling like a chatbot:** there is no chat panel. Refinement happens on the suggestion itself.
- **Discoverability:** the evaluator won't read docs. Seed the document with a hint.

### Deliberately left out

- Real-time multi-user editing (Yjs/CRDT). "Collaborative" here means human + AI.
- Auth, a database, Docker. The brief explicitly doesn't want them.
- Ghost-text autocomplete. It pushes toward "the AI writes the document".
- A general chat panel.
- Full version history. Undo covers the spirit of it.
- Broad test coverage. Only pure logic is tested: diff, parsing, validation.

---

## Step 2: Scaffold architecture

### Prompt (summarised)

> I agree with the MVP. Stack: Vite, React, TypeScript, CodeMirror 6, OpenRouter through a small server-side proxy, client-side diffing, localStorage. Before feature code: propose the folder structure, the exact npm packages, module responsibilities, TypeScript types, the API contract, and env variables, and give me the shell commands. Explain any dependency you intentionally avoid.

### Decision: proxy as a Vite plugin, not a separate server

- **Chosen:** mount `POST /api/suggest` as Vite `configureServer` / `configurePreviewServer` middleware.
- **Why:** one `npm run dev`, one process, no CORS, zero extra dependencies. The key stays in Node, because Vite only exposes `VITE_`-prefixed variables to the client.
- **Trade-off:** the endpoint only exists under `vite dev` / `vite preview`. That's fine for a locally run showcase.
- **Escape hatch:** the handler logic (`suggestHandler.ts`) is framework-agnostic, so moving it to Express or a serverless function is a small adapter.

### Dependencies

**Used:** `@codemirror/{state,view,commands,language,lang-markdown}`, `@lezer/highlight`, `diff` (jsdiff), `vitest`.

**Deliberately avoided:**

| Avoided | Reason |
|---|---|
| `codemirror` meta package / `basicSetup` | Brings line numbers, folding and autocomplete, which are wrong for prose |
| `@uiw/react-codemirror` | Hides direct access to `EditorView` and `StateField`, which are the core of the app |
| OpenAI / OpenRouter SDKs | One `fetch` call doesn't justify a dependency |
| `zod` | Payloads have 2–4 fields; a hand-written guard is shorter |
| Express/Hono, `concurrently`, `dotenv` | Unnecessary with the Vite-plugin approach |
| Redux/Zustand | Suggestion state lives in CodeMirror |
| Tailwind / UI kits | One CSS file is enough |

### Decision: one active suggestion at a time (MVP)

The suggestion StateField holds `Suggestion | null`, not a list. This removes overlap handling entirely. "Review whole doc" would upgrade it to a list later.

---

## Step 3: Scaffold execution

### Prompt (summarised)

> Actually scaffold the project now. Create the folders, install the MVP deps, add `.env.example`, ignore `.env`, add a test script, make sure `server/` and `shared/` are type-checked, and remove the Vite demo content. Report the structure, changed files, commands run, and build/test results. Strictly scaffolding only.

### Corrections during this step

1. **Wrong template generated.** `npm create vite@latest . -- --template react-ts` produced the *vanilla-TS* template, because npm consumed the `--template` flag. Claude spotted this from the output (`main.ts`, `counter.ts`, no React), deleted the generated files, and re-ran with `npx create-vite@latest . --template react-ts --no-interactive`.
2. **`npm test` with no tests.** `vitest run` exits with code 1 when no test files exist. The script became `vitest run --passWithNoTests`, and Claude flagged it as a deviation from the requested script.

### Verification

- Claude didn't assume the tsconfig `include` changes worked. It added a file with a deliberate type error to both `server/` and `shared/`, confirmed `tsc -b` reported both errors, then deleted the files.
- `npm run build` ✅, `npm test` ✅ (no tests yet), `npm run lint` ✅.

The template also ships **oxlint**; we kept it because it's zero-config.

Initial commit: `Scaffold Vite React TypeScript app`.

---

## Step 4: OpenRouter API plumbing

### Prompt (summarised)

> Review the scaffold and make the initial commit. Create `ai-sessions/` docs. Then implement **only** the OpenRouter plumbing: `shared/api.ts`, `server/openrouter.ts`, `server/prompt.ts`, `server/suggestHandler.ts`, `server/suggestPlugin.ts`, and the `vite.config.ts` changes. POST `/api/suggest`, server-side key, plain fetch, structured JSON, validation, timeout/error handling, stateless. No editor, no diff UI, no streaming, no refinement UI. Add focused tests, run build/test/lint, manually test one request. **Do not commit until we review together.**

### Decisions

- **Default model: `anthropic/claude-sonnet-5.5`.** Chosen after pulling live pricing from OpenRouter's `/models` endpoint rather than guessing a slug. At $2 / $10 per million tokens, a typical suggestion costs about $0.007, so the $5 cap allows roughly 700 requests. That's enough to favour writing quality over the cheapest model. It can be overridden with `OPENROUTER_MODEL`.
- **Refinement history includes the rationale.** The Step 2 type was `RefinementTurn { instruction, proposal }`. It became `{ instruction, replacement, rationale }`, so prior turns can be replayed to the model as its own JSON replies. Without the rationale, the model tends to copy the incomplete shape and omit it.
- **An empty `replacement` is valid.** "Delete this sentence" is a legitimate edit. `rationale` must be non-empty.
- **Retry once** when the model output can't be parsed. Upstream HTTP and timeout errors are not retried.
- **The upstream request is cancelled** if the browser disconnects (for example, the user rejects a pending suggestion), so aborted requests don't keep costing tokens.
- **The prompt treats document text as data.** Selection and context go inside tagged blocks, and the system prompt tells the model that content inside the tags is not instructions.
- **The handler takes the completion function as a dependency**, so tests exercise validation, retry and error mapping without network calls.
