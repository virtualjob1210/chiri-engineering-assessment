# AI-assisted development sessions

This folder records how the project was built with AI, as the assessment requires.

**Tool:** Claude Code (Claude Opus 5.5) in the VS Code extension, used as a pair-programming partner across one long working session.

## How I worked with Claude

- **Plan first, code later.** The first two prompts asked only for analysis: requirements, risks, what to leave out, architecture, types and the API contract. Claude wasn't allowed to write product code until scope was agreed.
- **One narrow stage per prompt.** Each prompt said what to build *and what not to build yet* ("do not implement diffs yet", "no refinement UI"). That kept every step small enough to review.
- **I made the product calls; Claude proposed and justified options.** Examples: CodeMirror over TipTap, one suggestion at a time, view-only history, no streaming, no chat panel. Where Claude deviated from what I asked, it had to say so, e.g. adding `--passWithNoTests`, or adding an `instructions[]` field to history entries.
- **Verify, don't trust.** Every stage ended with build, tests and lint, plus a scripted run in a real headless browser against the real OpenRouter API. Several bugs were found that way, not by the unit tests (see stages 05 and 07).
- **I reviewed and committed each stage myself.** Claude was told not to commit, so each commit in `git log` is a stage I read and approved.

## Sessions

| # | File | Stage | Commit |
|---|---|---|---|
| 01 | [Planning and architecture](01-planning-and-architecture.md) | Requirements, MVP scope, stack, types, API contract | (no code) |
| 02 | [Scaffolding and API](02-scaffolding-and-api.md) | Vite scaffold; OpenRouter proxy | `41ff1a6`, `d0a98b1` |
| 03 | [Editor foundation](03-editor-foundation.md) | CodeMirror, Markdown, autosave | `6f011c6` |
| 04 | [Selection and AI command](04-selection-and-ai-command.md) | Ask AI toolbar, Ctrl/⌘+K, first real requests | `433c7d5` |
| 05 | [Diff and accept/reject](05-diff-and-accept-reject.md) | Inline tracked changes, range mapping, undo | `5553822` |
| 06 | [Multi-turn refinement](06-multi-turn-refinement.md) | Refining a proposal before accepting | `1d585e2` |
| 07 | [Product polish](07-product-polish.md) | First-run UX, card placement, accessibility, cleanup | `dc8040b` |
| 08 | [Version history](08-version-history.md) | Log of accepted AI edits | `ebce23b` |
| 09 | [Final review](09-final-review.md) | README, these docs, repository hygiene | (final commit) |

## What these files are

These are **edited summaries** of the real conversation, not raw dumps. Each keeps:
- the prompt (quoted or closely paraphrased)
- what Claude recommended
- what I decided
- what went wrong and how it was caught

API keys, `.env` contents, system prompts and long tool logs are left out.
