# 01: Planning and architecture

**Goal:** turn the brief into a 4–6 hour MVP and agree the architecture before writing any code.

## Prompt 1: scope the MVP (no code)

> I want you to act as my senior pair-programming partner, not just generate the entire project. First, analyze the requirements and help me define a focused MVP that I can realistically build in about 4–6 hours… Summarize the core requirements, separate required from optional, identify the most important user workflow, recommend a minimal architecture, identify the biggest technical and UX risks, suggest what I should intentionally leave out, give me a short implementation plan in stages. **Do not write implementation code yet.**

The assessment PDF was attached.

### What Claude recommended

- **The requirement that matters most is #5, that it should "feel collaborative".** The brief names two failure modes: "a chatbot in a sidebar" and "something that completes the whole document".
- **The one workflow to get right:**
  > select text → invoke AI → instruction → inline tracked-change diff + one-line rationale → accept / reject / refine → keep writing

  An evaluator should get through it within 30 seconds, without reading docs.
- **CodeMirror 6 rather than TipTap,** even though the brief mentions TipTap. The user writes Markdown, so in CodeMirror the source *is* the document and AI edits are text diffs. With TipTap, AI output would have to be mapped back onto a rich-text node tree. Stated cost: a less Google-Docs look.
- **Constrain the model.** It should only see the selection plus bounded context, return structured JSON `{ replacement, rationale }`, and **never rewrite the whole document**.
- **Risks:**
  - stale ranges if the user types while a request is in flight
  - models wrapping JSON in code fences
  - noisy character-level diffs
  - the "chatbot" feel
  - discoverability
- **Leave out:** real-time multi-user editing (Yjs/CRDT), auth/database/Docker, ghost-text autocomplete ("pushes toward the AI writes the document"), a chat panel, full version history, broad test coverage.
- A staged plan, with **stage 3 (the inline diff) marked as the one never to cut.**

### What I decided

I agreed with the MVP and fixed the stack: Vite, React, TypeScript, CodeMirror 6, OpenRouter through a small server-side proxy, client-side diffing, localStorage.

## Prompt 2: architecture before scaffolding

> Before writing feature code, help me scaffold the project cleanly: folder structure, exact npm packages for the MVP only, responsibility of each module, TypeScript types for the suggestion workflow, the API contract, env variables, and shell commands. Explain any dependency you intentionally avoid.

### Key decisions

**Proxy as a Vite plugin, not a separate server.**
- Why: one `npm run dev`, one process, no CORS, zero extra dependencies. The key stays in Node because Vite only exposes `VITE_`-prefixed variables to the client.
- Trade-off: the endpoint only exists under `vite dev`/`preview`.
- Escape hatch: the handler is framework-agnostic, so moving it elsewhere is a small adapter.

**Dependencies deliberately avoided:**

| Avoided | Why |
|---|---|
| `codemirror` / `basicSetup` | Line numbers, folding, autocomplete: wrong for prose |
| `@uiw/react-codemirror` | Hides `EditorView`/`StateField`, which are the core of the app |
| OpenAI/OpenRouter SDKs | One `fetch` doesn't justify a dependency |
| `zod` | 2–4-field payloads; a hand-written guard is shorter |
| Express/Hono, `concurrently`, `dotenv` | Unnecessary with the Vite plugin |
| Redux/Zustand, Tailwind, UI kits | Suggestion state lives in CodeMirror; one CSS file is enough |

**Other decisions:**
- **One active suggestion at a time** (`Suggestion | null`, not a list). This removes overlap handling entirely; "review whole doc" was parked as a stretch goal.
- **A stateless API:** `POST /api/suggest` takes `{ instruction, selection, context, history }` and returns `{ replacement, rationale }` or `{ error: { code, message } }`. Refinement history travels with each request.
- **Env:** `OPENROUTER_API_KEY` (required) and `OPENROUTER_MODEL` (optional), with an explicit warning never to use the `VITE_` prefix.
