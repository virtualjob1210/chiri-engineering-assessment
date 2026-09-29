# 09: Final review

## Prompt 1

````text
The implementation is complete. Please do the final submission pass only.
Do not add any new product features unless you find a clear bug.
1. Final README
Rewrite README.md so an evaluator can quickly understand, run, and review the project.
Include:
- project overview
- core workflow:
  select text → ask AI → review diff → refine → accept/reject
- version history behavior
- tech stack
- architecture overview
- how to run locally
- required environment variables
- OpenRouter setup
- keyboard shortcuts
- testing commands
- important engineering decisions
- trade-offs
- deliberate omissions
- known limitations
- what I would add or change with more time
Keep it concise and skimmable. Do not claim features that are not actually implemented.
Mention specifically that:
- AI suggestions never modify the document until accepted
- diffs are computed client-side
- refinements preserve the original document until final acceptance
- version history records accepted AI edits as an append-only collaboration log
- undo restores document text but does not remove version-history entries
2. Complete the AI session documentation
The assessment requires the AI development sessions to be committed.
Review our actual Claude development history and organize ai-sessions/ into a clear chronological record, for example:
ai-sessions/
  README.md
  01-planning-and-architecture.md
  02-scaffolding-and-api.md
  03-editor-foundation.md
  04-selection-and-ai-command.md
  05-diff-and-accept-reject.md
  06-multi-turn-refinement.md
  07-product-polish.md
  08-version-history.md
  09-final-review.md

Preserve the real engineering process:
- important prompts
- Claude's recommendations
- decisions I made
- ideas I rejected
- trade-offs
- bugs discovered
- corrections
- failed attempts where useful
- testing that changed the implementation
Do not rewrite the process into a fake perfect narrative.
Do not include:
- API keys
- .env contents
- secrets
- irrelevant system prompts
- machine-sensitive information
- huge raw tool logs that don't help the evaluator
Create an ai-sessions/README.md that briefly explains how I used Claude as a pair-programming partner throughout the project.
3. Repository hygiene review
Inspect the repository carefully for:
- accidentally committed .env
- API keys or secrets
- debug logging
- temporary files
- obsolete .gitkeep files
- build artifacts
- stale comments
- unused code
- machine-specific paths
- screenshots or assets that should not be committed
- inconsistent naming
Run a search for likely secrets such as:
- OPENROUTER_API_KEY
- sk-
- actual token values
Do not remove .env.example.
4. Git history
Review git log --oneline.
Confirm the commit history tells a reasonable incremental engineering story.
Do not squash everything into one commit.
If there are obvious accidental/noise commits, tell me what you recommend, but do not rewrite history unless necessary.
5. Final automated verification
Run:
npm run build
npm test
npm run lint
git diff --check
git status

Report the exact results.
6. Final manual verification checklist
Give me a short checklist to verify manually before submission:
- fresh first launch
- Markdown editing
- persistence after refresh
- select text and Ask AI
- quick actions
- custom instruction
- visible diff
- refine multiple times
- Accept
- Reject
- Undo accepted change
- stale suggestion protection
- error handling
- version history entry after Accept
- no history entry after Reject
- history survives reload
- Reset sample
- keyboard shortcuts
7. Submission readiness
At the end, show me:
1. final README structure
2. final ai-sessions/ structure
3. files changed
4. final test/build/lint results
5. git status
6. git history
7. any remaining risks or known limitations
8. anything I must manually do before submission
Do not create the final commit yet.
I want to review everything first, then I will make the final documentation/submission commit.
````

## What was done

- **README rewritten for evaluators:** quick start, workflow, keyboard shortcuts, the guarantees (nothing changes until Accept, client-side diffs, originals kept through refinement, history as an append-only log), architecture, decisions, trade-offs, limitations. Every number in it (model, limits, context size, cap, test count) was checked against the code rather than written from memory.
- **Session docs reorganised** into this chronological set. The earlier combined file (`01-planning-and-scaffolding.md`) was split into 01 and 02.
- **Hygiene:**
  - `.env` was never committed (checked across all history).
  - No key-like strings in any commit.
  - The real key value appears in no file other than `.env` (checked by match count, without printing the key).
  - No stray debug logging: the two `console` calls are intentional server-side error logs.
  - No machine-specific paths.
  - No committed build output or screenshots (the browser-test scripts and screenshots lived in a temporary directory outside the repo).
- **Removed:**
  - the obsolete `ai-sessions/.gitkeep`
  - the scaffold-era `--passWithNoTests` flag on `npm test` (there are 97 tests now, and the flag would hide an accidentally empty test run)

## Git history

Eight commits, one per reviewed stage, from scaffold to version history. There are no noise or fix-up commits, so no history rewriting was needed.

## Prompt 2

````text
Please update the ai-sessions/*.md files so the prompt sections contain the exact prompts I actually sent you, not rewritten or summarized versions.
For each AI session Markdown file:
1. Find the corresponding prompt(s) from our actual Claude conversation history.
2. Copy my prompt text verbatim, preserving:
   - wording
   - bullet points
   - capitalization
   - punctuation
   - code blocks
   - ordering
3. Do not paraphrase, shorten, clean up, or improve my prompt.
4. If a session had multiple important prompts, include each one in chronological order under separate headings such as:
## Prompt 1

<exact prompt I sent>

## Prompt 2

<exact prompt I sent>

5. Keep the existing Decisions, Findings, Verification, and other summary sections if they are accurate, but do not replace my real prompt with a summary.
6. If you cannot recover an exact prompt from the conversation history, clearly write:
Exact prompt not available in the retained session history.
Do not reconstruct it from memory or invent wording.

update all md files in ai-sessions
````

Claude replaced the summarised prompt quotes in 01–09 with the exact prompts above. They were copied programmatically from the retained Claude Code session transcript, not retyped. The only things removed were the chat client's paste-wrapper tags and automatic IDE-context notices ("the user opened file X"), which I didn't write. All 13 prompts were recoverable, so none is marked as unavailable.
