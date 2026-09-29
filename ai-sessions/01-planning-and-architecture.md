# 01: Planning and architecture

**Goal:** turn the brief into a 4–6 hour MVP and agree the architecture before writing any code.

## Prompt 1

The assessment PDF was attached to this message.

````text
I’m working on this engineering assessment.
I want you to act as my senior pair-programming partner, not just generate the entire project.
First, analyze the requirements and help me define a focused MVP that I can realistically build in about 4–6 hours.
Please:
1. Summarize the core product requirements.
2. Separate required features from optional features.
3. Identify the most important user workflow.
4. Recommend a minimal architecture.
5. Identify the biggest technical and UX risks.
6. Suggest what I should intentionally leave out.
7. Give me a short implementation plan in stages.
Do not write implementation code yet.
My goal is to demonstrate good product judgment, clean engineering, and effective AI-assisted development.
````

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

## Prompt 2

````text
I agree with the focused MVP and I want to use:
- Vite
- React
- TypeScript
- CodeMirror 6
- OpenRouter through a small server-side proxy
- client-side diffing
- localStorage for the document
Before writing feature code, help me scaffold the project cleanly.
Please do the following:
1. Propose the minimal folder structure.
2. List the exact npm packages we need for the MVP only.
3. Explain the responsibility of each main file/module.
4. Define the TypeScript types for the core suggestion workflow.
5. Define the API contract between frontend and the OpenRouter proxy.
6. Identify environment variables and create an .env.example plan.
7. Give me the shell commands to create the project and install dependencies.
Do not implement the editor or AI features yet.
Keep the architecture small enough for a 4–6 hour assessment and explain any dependency you intentionally avoid.
````

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
