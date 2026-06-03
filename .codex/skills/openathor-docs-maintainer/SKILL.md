---
name: openathor-docs-maintainer
description: Use when creating, splitting, moving, or maintaining OpenAthor documentation under docs/. Enforces the route-page plus same-name child-folder documentation structure.
---

# OpenAthor Docs Maintainer

Use this skill for OpenAthor documentation changes.

## Structure Rule

Every substantial topic uses:

```text
docs/<topic>.md
docs/<topic>/
  child-doc.md
```

The top-level file is a route page. It should contain:

- Topic goal
- Reading order
- Links to child docs
- Current conclusion or status

Detailed content belongs in the same-name child folder.

## Editing Workflow

1. Read the relevant `docs/<topic>.md` route page.
2. Read only the child docs needed for the change.
3. Edit child docs for detailed changes.
4. Update the route page when adding, removing, or reordering child docs.
5. Keep decisions, open questions, principles, and validation separate when they become substantial.

## Quality Rules

- Do not let a route page become the main content dump.
- Do not duplicate long sections across docs.
- Prefer small focused files over a single large file.
- Preserve the Pi Agent first product decision unless the user changes it.
- Keep MVP scope and later expansion clearly separated.
