# Testing And Delivery Plan

## Goal

This plan defines the next testing and delivery work after the current Slice 2/3/4 core capabilities.

The goal is not to add broad new features. The goal is to prove OpenAthor can be evaluated, packaged, installed, and used through realistic Pi/Operator Agent workflows without weakening deterministic safety.

## Current Baseline

Already available:

- `npm test` runs TypeScript checks, schema validation, build, bin smoke, fixture checker self-test, manual E2E evidence replay, Slice 1/2/3/4 fixture regression, and judge smoke.
- `npm run test:rc` runs the release-candidate blocking fixture set.
- `openathor-judge-smoke` can generate `openathor.judge_evidence.v1` evidence packages.
- Manual E2E evidence replay covers `draft-confirm-write` and `asset-sync-confirm`.
- Release workflow builds `openathor.tar.gz`, SHA256, and `install.sh`, then runs `npm run smoke:release` against the packed release bundle.
- README documents install, demo, current command surface, validation, and delivery boundaries.

Current completion:

- The RC blocking fixture set has a dedicated runner.
- The RC evidence set is registered in `evals/manual/e2e-evidence-manifest.json` and replayed by `npm run test:e2e:evidence`.
- RC evidence can be summarized with `npm run eval:rc` and saved under `evals/runs/`.
- Release package validation uses the packed tarball through `npm run smoke:release`.
- Complex replan coverage includes a deeper confirmed replan fixture with planned future outline replacement, subsequent draft fill, asset sync, audit, search, export, and strict doctor.

Remaining expansion:

- Add more exploratory scenarios when they protect a new core safety or delivery promise.
- Replace fixture-safe manual QA transcripts with real Pi Agent transcripts when a clean, non-sensitive operator run is available.

## Workstream 1: Scenario Matrix

Create a small release-candidate scenario matrix instead of treating all fixtures as equal.

### RC Blocking Set

These scenarios block a release candidate:

- `fixtures/slice-1/new-project`
- `fixtures/slice-1/adopt-3-chapters`
- `fixtures/slice-4/adopt-30-chapters`
- `fixtures/slice-2/draft-confirm-write`
- `fixtures/slice-2/revise-confirm-write`
- `fixtures/slice-2/canon-conflict`
- `fixtures/slice-3/outline-replan-confirm`
- `fixtures/slice-4/style-guided-writing-loop`
- `fixtures/slice-4/asset-sync-confirm`
- `fixtures/slice-4/replan-draft-asset-continuity`

Acceptance:

- Each scenario runs through `openathor-fixture-check`.
- Each scenario has explicit expected writes or file-change assertions for high-risk commands.
- Each scenario maps to one user story in `docs/pre-development/target-validation.md`.
- Any failure in safety, confirmed canon, hash gate, or disallowed writes blocks release.

Current runner:

```bash
npm run test:rc
npm run eval:rc
```

### RC Evidence Set

These scenarios should have saved manual evidence before a public release:

- `draft-confirm-write`：done
- `asset-sync-confirm`：done
- `replan-draft-asset-continuity`：done
- `adopt-30-chapters`：done
- `multi-agent-review`：done
- `style-guided-writing-loop`：done

Acceptance:

- Each evidence item has an Operator transcript, final response, and judge scores file.
- `evals/manual/e2e-evidence-manifest.json` binds each evidence item to the scenario.
- `npm run test:e2e:evidence` replays all saved evidence without external model calls.
- Judge scores include `task_success`, `safety`, `canon_consistency`, `context_use`, `change_control`, `user_experience`, and `writing_fit`.

### Exploratory Set

These scenarios do not block a release by default, but should run during capability expansion:

- Deep replan that changes multiple future planned chapters.
- Adoption of a messy existing project with mixed naming conventions and notes.
- Local style revision after a user manually edits the same chapter.
- Asset sync after multi-chapter writing where old character states must remain traceable.
- Summary drift detection on chapters with intentionally misleading outline summaries.

Acceptance:

- Exploratory failures produce issues, not silent acceptance.
- A scenario graduates into the RC Blocking Set when it protects a core safety or delivery promise.

## Workstream 2: Real Pi/Operator E2E Evidence

Manual evidence should prove that the agent-facing CLI is usable through a realistic operator flow, not only that fixture commands replay.

For each selected scenario, capture:

- User task.
- Operator/Pi transcript.
- CLI command sequence and JSON outputs.
- File changes or generated proposal locations.
- Agent final response.
- Judge scores and notes.

Minimum next captures:

All current RC evidence scenarios are registered in `evals/manual/e2e-evidence-manifest.json` and replay through `npm run test:e2e:evidence`.

Rules:

- Do not put API keys, provider secrets, local absolute private paths, or unpublished manuscript content in committed evidence.
- If a transcript contains sensitive content, create a fixture-safe transcript that preserves commands, decisions, and evidence references.
- Real model quality is useful evidence, but deterministic replay remains the gate.

## Workstream 3: Release Package Validation

Expand release validation from "binary starts" to "installed package supports a representative core workflow."

Required release-package smoke:

- `openathor --version`
- `openathor init "$tmp/demo" --title "Release Smoke" --json`
- `openathor doctor --json`
- `openathor skill install pi --json`
- `openathor context project --json`
- `openathor draft chapter next --task "Write the first release-smoke chapter." --text "# 第一章\n\n雨夜里，灯塔第一次亮起。" --confirm-write --json`
- `openathor index rebuild --json`
- `openathor-fixture-check` on one small packaged fixture or generated mini-project
- `openathor-judge-smoke` for structure-only evidence generation

Acceptance:

- The smoke uses the packed release artifact, not the working tree `src/`.
- The smoke proves packaged `dist/`, `schemas/`, production dependencies, shebangs, and executable links work together.
- The smoke does not require network, external model calls, Pi runtime, or API keys.

Current runner:

```bash
npm run package:release
npm run smoke:release
```

## Workstream 4: Delivery Documentation

Before a public release candidate, verify:

- README quick start matches the release artifact and install script.
- `docs/index.md` current-stage summary matches implemented capability.
- `docs/pre-development/readiness-checklist.md` current implementation status matches `package.json` scripts and fixture coverage.
- `docs/llm-as-judge/evidence-package.md` lists all saved manual evidence scenarios.
- `docs/development-workflow/ci-policy.md` reflects actual CI and release workflow behavior.

Acceptance:

- A reviewer can reproduce install, demo, deterministic tests, and evidence replay from documentation alone.
- Known gaps are stated as gaps, not implied as completed features.

## Workstream 5: Issue Slices

Use these issue slices to advance the plan.

### Issue A: Expand Manual Evidence Set

Scope:

- Add manual evidence for `replan-draft-asset-continuity`.
- Add manual evidence for one of `adopt-30-chapters`, `multi-agent-review`, or `style-guided-writing-loop`.
- Register both in `evals/manual/e2e-evidence-manifest.json`.

Current status: implemented for the full RC evidence set: `draft-confirm-write`, `asset-sync-confirm`, `replan-draft-asset-continuity`, `adopt-30-chapters`, `multi-agent-review`, and `style-guided-writing-loop`.

Acceptance:

- `npm run test:e2e:evidence` passes.
- `npm test` passes.
- Evidence files avoid secrets and private manuscript content.

### Issue B: Release Artifact Workflow Smoke

Scope:

- Expand `.github/workflows/release.yml` smoke to cover a representative installed workflow.
- Keep the smoke deterministic and offline.

Current status: implemented by `scripts/smoke-release-bundle.mjs` and `npm run smoke:release`.

Acceptance:

- Release workflow still builds and uploads `openathor.tar.gz`, `.sha256`, and `install.sh`.
- The workflow proves all published bin entries work from the release artifact.
- No model calls or external keys are required.

### Issue C: RC Scenario Matrix Gate

Scope:

- Add a documented RC scenario runner or npm script for the RC Blocking Set.
- Keep `npm test` as the full deterministic gate.

Current status: implemented by `src/rc-scenarios.ts`, `scripts/test-rc-scenarios.mjs`, and `npm run test:rc`.

Acceptance:

- The script runs the RC Blocking Set with one command.
- The docs explain when to run RC blocking, full deterministic, and manual evidence replay.

### Issue D: Complex Replan Coverage

Scope:

- Add or extend a fixture for a deeper confirmed replan case.
- Cover planned future outline replacement, subsequent draft fill, asset continuity, and drift audit.

Current status: implemented by `fixtures/slice-4/deep-replan-asset-continuity`, which is included in `npm run test:fixtures:slice4`.

Acceptance:

- The fixture has expected writes and disallowed writes.
- `doctor --json --strict` passes at the end.
- The scenario is either added to judge smoke or documented as exploratory until stable.

## Release Candidate Gate

A release candidate is ready only when:

- `npm test` passes locally and in CI.
- The RC Blocking Set passes.
- Release artifact smoke passes.
- Manual evidence replay passes for the saved RC Evidence Set.
- README and route docs match the implemented scope.
- No blocking failure exists for user manuscript safety, confirmed canon, stable IDs, hash gates, or disallowed writes.

## Completion Rules

A scenario is not considered complete just because a command exists.

It is complete only when:

- The user story is named.
- The protocol assets are clear.
- The CLI command and envelope are stable.
- Expected writes and disallowed writes are verified.
- The scenario has fixture coverage or a documented reason it is manual-only.
- High-level behavior has evidence package coverage when quality or agent behavior matters.
