---
name: openathor-iteration-pm
description: Use when working on OpenAthor product planning, MVP scope, pre-development readiness, user stories, product decisions, or deciding whether implementation can begin. Enforces the project's PM-first workflow before writing product code.
---

# OpenAthor Iteration PM

Use this skill for OpenAthor product planning, MVP decisions, scope control, readiness reviews, and implementation gatekeeping.

## Required Reading

Read these first, as needed:

- `docs/pre-development.md`
- `docs/pre-development/readiness-checklist.md`
- `docs/product-shape-pi-agent.md`

Then read the linked child document most relevant to the task.

## Working Rules

- Treat OpenAthor's current phase as pre-development unless the user explicitly says the readiness checklist is complete and asks to implement.
- Do not write product code while readiness-critical docs are missing or unresolved.
- It is OK to create or update docs, `.codex/skills/`, examples, schemas-in-docs, and CLI contract drafts.
- Every product recommendation should land in a document or checklist when it changes project direction.
- Keep scope Pi Agent first unless the user explicitly changes that product decision.

## Product Defaults

- No self-built TUI in MVP.
- No web editor in MVP.
- User writes in an external text editor.
- Pi Agent CLI is the user-facing agent interface.
- OpenAthor CLI is agent-facing infrastructure.
- Skills guide agent behavior; CLI performs deterministic project operations.
- Existing novels must be adoptable without rewriting original manuscripts.

## Implementation Gate

Before implementation, verify these exist:

- Product shape
- MVP user stories
- Project protocol
- CLI command contracts
- Pi Skill behavior
- Adopt/import behavior
- Validation fixtures plan

If any are missing, update docs first and tell the user what remains blocked.
