# Repository Guidelines

## Project Structure & Module Organization

This repository is currently in pre-development. There is no product source code yet.

- `docs/index.md` is the documentation entry point.
- `docs/pre-development.md` routes to planning, readiness, Codex workflow, and validation docs.
- `docs/product-shape-pi-agent.md` routes to the Pi Agent first product-shape docs.
- `docs/<topic>/` contains detailed child documents for each top-level route page.
- `.codex/skills/` contains project-local Codex skills for PM iteration and documentation maintenance.

Use the route-page pattern for new documentation topics:

```text
docs/<topic>.md
docs/<topic>/
  child-doc.md
```

## Build, Test, and Development Commands

No build or test commands exist yet because implementation has not started.

Useful inspection commands:

```bash
find docs -maxdepth 3 -type f -print
find .codex -maxdepth 4 -type f -print
```

Before adding product code, update the readiness checklist in `docs/pre-development/readiness-checklist.md`.

## Coding Style & Naming Conventions

For Markdown, use concise headings, short paragraphs, and actionable bullet points. Keep top-level route pages brief; place detailed content in same-name child directories.

Use lowercase kebab-case for documentation files and directories, for example:

```text
docs/project-protocol.md
docs/project-protocol/openathor-yaml.md
```

Keep project-local skills under `.codex/skills/<skill-name>/SKILL.md`.

## Testing Guidelines

Testing strategy is not defined yet. For now, validation is documentation-driven and should be captured in `docs/pre-development/mvp-validation.md`.

When implementation begins, every feature should trace back to:

- a user story
- a CLI contract
- an expected file change
- a validation fixture or test case

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no commit history or project-specific convention exists.

When Git is initialized, prefer short imperative commit messages such as:

```text
docs: add project protocol draft
skills: add OpenAthor documentation maintainer
```

Pull requests should include a concise summary, changed docs or behavior, linked issues if any, and validation notes. For UI work in the future, include screenshots or terminal output where relevant.

## Agent-Specific Instructions

This project is PM-first. Do not start product implementation until the readiness checklist is complete and the user explicitly asks to implement.

For product planning, use `.codex/skills/openathor-iteration-pm/SKILL.md`. For documentation changes, use `.codex/skills/openathor-docs-maintainer/SKILL.md`.
