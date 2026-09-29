# AI-assisted development sessions

This folder records how AI was used to build this project, as required by the assessment.

The project was built in pair-programming style with **Claude Code** (Claude Opus 5.5, running in the VS Code extension). I drove the product and architecture decisions; Claude proposed options, wrote code in small reviewed steps, and ran builds and tests.

## What's here

| File | Covers |
|---|---|
| [01-planning-and-scaffolding.md](01-planning-and-scaffolding.md) | Requirements analysis, MVP scope, architecture, project scaffold, OpenRouter API plumbing |

Each session file is a cleaned-up log, not a raw dump. It keeps:

- **Prompts**: what I asked for, close to verbatim.
- **Decisions**: what we chose and why, including alternatives we rejected.
- **Corrections**: places where the AI got something wrong or I redirected it.
- **Trade-offs**: things deliberately left out.

Where a raw transcript export is included, it sits next to the summary with the same number prefix.

## How I worked with the AI

1. **Plan before code.** The first prompts asked for analysis only: requirements, risks, and what to leave out. No code was written until scope and architecture were agreed.
2. **Small, reviewable steps.** Each step had an explicit boundary ("scaffold only", "API plumbing only, no UI") and ended with build/test/lint results.
3. **I commit, after review.** Feature code is reviewed before it's committed, so the git history reflects approved increments.
