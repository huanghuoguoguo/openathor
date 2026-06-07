export const PI_SKILL_TEXT = `---
name: openathor
description: Use when helping a user work inside an OpenAthor novel project with OpenAthor CLI, project protocol, review packs, context, writing proposals, and safety checks.
---

# OpenAthor Pi Skill

Use this skill when helping a user work inside an OpenAthor novel project.

## Product Boundary

- OpenAthor is Pi Agent first.
- The user writes in their own editor; do not create a TUI or web editor.
- OpenAthor CLI is the deterministic tool layer.
- Plaintext Markdown/YAML/JSON files are the source of truth.
- SQLite and vector indexes are derived data.
- Do not write unique user content only into derived indexes.

## Required CLI Use

Prefer JSON output for all OpenAthor CLI calls:

\`\`\`bash
openathor doctor --json
openathor adopt --dry-run --json
openathor adopt --json
openathor index rebuild --json
openathor index rebuild --vector --json
openathor assets audit --json
openathor assets sync chapter <id-or-order> --from <asset-package.yaml|json> --json
openathor assets sync chapter <id-or-order> --from <asset-package.yaml|json> --confirm --base-hash <sha256:...> --assets-hash <path=sha256:...> --json
openathor assets link-backfill characters --json
openathor search text "<query>" --json
openathor search related chapter <id-or-order> --json
openathor search semantic "<query>" --json
openathor style analyze <authorized-reference-path> --json
openathor style profile apply <profile-id> --confirm --base-hash <sha256:...> --json
openathor outline show --json
openathor outline impact <id-or-order> --json
openathor style check chapter <id-or-order> --json
openathor style revise chapter <id-or-order> --goal "<goal>" --json
\`\`\`

Read the JSON envelope before replying. In the user reply, summarize:

- relevant source files
- warnings
- actual writes
- next action or confirmation needed

## Project Detection

Before writing or advising on project state:

1. Run \`openathor doctor --json\` in the current directory.
2. If the project is missing, ask whether the user wants \`openathor init\` for a new project or \`openathor adopt --dry-run\` for existing drafts.
3. If doctor reports \`OA_INDEX_STALE\`, run or suggest \`openathor index rebuild --json\` before relying on derived indexes.
4. Use \`openathor search text "<query>" --json\` to find keyword evidence across plaintext project files.
5. Use \`openathor search related chapter <id-or-order> --json\` to find deterministic related context by term overlap.
6. Use \`openathor index rebuild --vector --json\` and \`openathor search semantic "<query>" --json\` when the user asks for looser thematic or similarity retrieval.
7. Use \`openathor assets audit --json\` after longform asset, outline, or manuscript changes to check unresolved links, drift, and project-level character profile summary.
8. Use \`openathor assets sync chapter <id-or-order> --from <asset-package> --json\` after drafting a chapter when new characters, events, hooks, or chapter summary links should be reviewed for persistence.
9. Use \`openathor assets link-backfill characters --json\` when an adopted longform project already has confirmed character assets but older chapters are missing deterministic outline character links.
10. Use \`openathor style check chapter <id-or-order> --json\` after drafting or revising a chapter when style consistency matters.
11. Use \`openathor style revise chapter <id-or-order> --goal "<goal>" --json\` when style drift should become a proposal, then provide revised prose externally and confirm only with a fresh source hash.
12. Use \`openathor outline impact <id-or-order> --json\` before proposing any chapter archive/delete action.
13. Use \`openathor style analyze <path> --json\` only for user-owned, licensed, public-domain, or otherwise authorized reference text.
14. Use \`openathor style profile apply <profile-id> --confirm --base-hash <sha256:...> --json\` only after the user approves a pending style profile.

## Adopting Existing Manuscripts

For existing novels:

1. Run \`openathor adopt --dry-run --json\` first.
2. Do not edit, move, rename, or rewrite original manuscript files during adoption.
3. Put uncertain chapter order, duplicate titles, scraps, and unclassified files into questions.
4. Do not treat model inference as confirmed canon.
5. Use \`openathor adopt --json\` only when the dry-run result is clear, or \`--confirm-ambiguous\` only when the user has explicitly accepted unresolved questions.

## Writing And Revision Safety

Current OpenAthor implements deterministic context packs, proposal-mode writing commands, controlled confirmed manuscript writes, and optional derived semantic search. It does not directly generate final manuscript prose.

Use these commands as task packages:

\`\`\`bash
openathor plan --task "<task>" --json
openathor draft chapter <id-or-order> --task "<task>" --json
openathor review chapter <id-or-order> --task "<task>" --json
openathor review chapter <id-or-order> --task "<task>" --multi-agent --json
openathor revise chapter <id-or-order> --task "<task>" --json
openathor canon sync <id-or-order> --task "<task>" --json
\`\`\`

Confirmed new-chapter write is allowed only after explicit user confirmation:

\`\`\`bash
openathor draft chapter next --task "<task>" --text "<manuscript>" --confirm-write --json
\`\`\`

For confirmed new-chapter writes, make the first line of \`--text\` a clear chapter title. Preferred forms are a Markdown H1 such as \`# 最后一班车\`, or a plain chapter line such as \`第一章 最后一班车\` / \`Chapter 1: Last Bus\`. When appending a brand-new chapter, OpenAthor uses that title line as the chapter title in outline and index metadata.

If the outline already has an unwritten planned chapter, \`openathor draft chapter next --confirm-write\` fills that planned chapter and returns \`filled_planned_chapter: true\`; otherwise it appends a new chapter. When filling a planned chapter, the CLI preserves the planned outline title and reports any manuscript-title mismatch as \`OA_DRAFT_PLANNED_TITLE_MISMATCH\`. After structural edits such as confirmed replan, run \`openathor outline show --json\` before drafting so you know which planned chapter will be filled.

Confirmed revision is allowed only with a fresh source hash:

\`\`\`bash
openathor revise chapter <id-or-order> --task "<task>" --text "<manuscript>" --base-hash "sha256:..." --confirm-write --json
\`\`\`

Confirmed style revision is allowed only with revised prose generated outside the CLI and a fresh source hash:

\`\`\`bash
openathor style revise chapter <id-or-order> --goal "<goal>" --json
openathor style revise chapter <id-or-order> --goal "<goal>" --text "<revised manuscript>" --diff --json
openathor style revise chapter <id-or-order> --goal "<goal>" --text "<revised manuscript>" --base-hash "sha256:..." --confirm-write --json
\`\`\`

When using proposal commands:

- do not pretend OpenAthor has generated or revised manuscript text
- use \`openathor context --json\` or \`openathor context chapter <id-or-order> --json\` before writing advice
- do not overwrite user manuscript files
- use \`openathor review ... --multi-agent --json\` for high-stakes or broad chapter review; dispatch the returned \`review_pack.roles\` as separate review passes, then merge structured findings yourself
- sub-agent review roles may return findings, questions, and suggestions only; they must not write manuscript files, confirmed canon, or outline files
- preserve source-backed disagreements from role findings as questions instead of silently resolving them
- use confirmed draft writes only for \`chapter next\`; fill planned outline chapters when available and do not overwrite existing chapter files
- use confirmed revision only when the source hash comes from the latest \`openathor context\` or \`openathor doctor\` output
- for writing advice, read relevant plaintext sources and provide suggestions in the conversation
- after writing or revising longform assets, run \`openathor assets audit --json\` and report unresolved links, drift, and character profile summary before claiming continuity is stable
- after writing a chapter that introduces or changes story assets, create a structured asset package in a project note and run \`openathor assets sync chapter <id-or-order> --from <asset-package> --json\`; do not edit \`bible/characters.md\`, \`bible/timeline.md\`, \`notes/hooks.md\`, or \`outline/chapters.yaml\` by hand to bypass the sync flow
- asset package canonical shape is:

\`\`\`yaml
characters:
  - id: char_linche
    name: 林澈
    role: 旧案调查者
    traits: [谨慎, 证据优先]
    current_state: 正在核对空位名单签名缺口。
    notes: [不能通灵；不能靠超自然破案。]
timeline_events:
  - id: event-signature-gap-found
    title: 林澈发现签名缺口
    summary: 林澈和孟夏发现更正通知日期矛盾，决定先核对签名。
hooks:
  - id: hook-empty-berth-list
    title: 空位名单的签名缺口
    status: advanced
    summary: 空位名单出现后，突破口变成核对签名而不是公开保护对象姓名。
chapter:
  summary: 本章推进空位名单和警署篡改日期线索。
  links:
    characters: [char_linche]
    timeline_events: [event-signature-gap-found]
    hooks: [hook-empty-berth-list]
\`\`\`

- use \`event-...\`, \`event_...\`, or \`ev_...\` IDs for timeline events; use \`char_...\` or kebab-case IDs for characters; use \`hook-...\` or \`hook_...\` IDs for hooks
- do not put the only structured assets under vague metadata; OpenAthor accepts common \`links.*\` object arrays and \`updates.*\` entries, but the canonical top-level arrays above are preferred
- after a confirmed multi-chapter draft, do not stop at manuscript files; for each drafted chapter, sync the chapter summary, character states, timeline events, hooks, and outline links before claiming the longform assets have been persisted
- asset sync proposal output includes \`source_hash\` for the target chapter and \`asset_hashes\` for every asset source that the confirmed write would modify
- only after explicit user confirmation, rerun asset sync with \`--confirm --base-hash "sha256:..." --assets-hash "path=sha256:..."\`; use \`source_hash\` and every \`asset_hashes\` entry from the latest sync proposal, and do not omit asset hashes
- if confirmed asset sync returns \`OA_ASSETS_SOURCE_CHANGED\`, stop and show the changed asset source to the user; do not regenerate hashes blindly or overwrite user-edited characters, timeline, hooks, or outline
- confirmed asset sync writes new assets and merges updates for existing character, timeline, and hook assets; expect existing character \`current_state\` to change and earlier states to remain as \`note: previous_state: ...\`
- run \`openathor assets audit --json\` after confirmed asset sync and report unresolved outline links, character link drift, summary drift, and weak character profile summaries
- if \`assets audit\` reports character link drift in already adopted chapters and the relevant people already exist in \`bible/characters.md\`, run \`openathor assets link-backfill characters --json\`; after user confirmation, rerun with \`--confirm --base-hash "sha256:..."\` using the latest \`outline/chapters.yaml\` hash
- \`assets link-backfill\` only adds outline \`links.characters\` for confirmed character names that already appear in chapter text; do not use it to create new characters, infer relationships, or change canon
- after writing or revising chapter prose, run \`openathor style check chapter <id-or-order> --json\` when style stability is part of the task; treat findings as review prompts, not automatic edits
- use \`openathor style revise\` for style-specific proposal/diff/hash-confirm workflow; do not claim the CLI generated the revised prose
- do not treat a pending style profile as confirmed guidance; show it to the user and apply it with \`openathor style profile apply ... --confirm --base-hash\` only after explicit approval
- ask before any file write that affects manuscript, outline, or confirmed canon

## Outline Safety

Use proposal commands before broad structure edits:

\`\`\`bash
openathor outline insert --after <id-or-order> --title "<title>" --json
openathor outline move <id-or-order> --after <id-or-order> --json
openathor outline split <id-or-order> --at-line <line> --title-before "<title>" --title-after "<title>" --json
openathor outline merge <id-or-order> <next-id-or-order> --title "<title>" --json
openathor outline replan --from <id-or-order> --task "<task>" --json
\`\`\`

Confirmed split is allowed only after explicit user confirmation and a fresh source hash:

\`\`\`bash
openathor outline split <id-or-order> --at-line <line> --title-before "<title>" --title-after "<title>" --confirm --base-hash "sha256:..." --json
\`\`\`

Confirmed merge is allowed only after explicit user confirmation and fresh source hashes for both adjacent chapters. It merges into the target chapter, archives the next chapter, and does not delete manuscript files:

\`\`\`bash
openathor outline merge <id-or-order> <next-id-or-order> --title "<title>" --confirm --base-hash "sha256:..." --next-base-hash "sha256:..." --json
\`\`\`

Confirmed replan can replace only planned future outline chapters from a structured package. It does not rewrite manuscript files or replace drafted/revised chapters:

\`\`\`bash
openathor outline replan --from <id-or-order> --task "<task>" --from-package <replan-package.yaml|json> --confirm --base-hash "sha256:..." --json
\`\`\`

Use the latest \`outline/chapters.yaml\` hash as \`--base-hash\`. If the replan boundary includes drafted/revised chapters, use archive/split/merge/revise flows instead of forcing replan.

Before archiving or deleting a chapter:

1. Run \`openathor outline impact <id-or-order> --json\`.
2. Tell the user that OpenAthor defaults to archive, not physical deletion.
3. Confirm that manuscript files and confirmed canon will be preserved.
4. Only after explicit user approval, run:

\`\`\`bash
openathor outline archive <id-or-order> --confirm --base-hash "sha256:..." --json
\`\`\`

Never physically delete, move, or rename manuscript files for an archive request.

## Canon And Style

- Confirmed canon belongs in \`bible/canon.md\`.
- Unverified inference belongs in \`bible/canon.pending.md\` or questions.
- New or changed longform assets should be persisted through \`openathor assets sync\`: proposal first, confirmed write only with user approval, a matching chapter hash, and matching asset source hashes from the proposal.
- Adopted longform projects with confirmed characters but missing old chapter links may use \`openathor assets link-backfill characters\`: proposal first, confirmed write only with user approval and a matching outline hash.
- Confirmed asset sync may update existing confirmed character, timeline, and hook files from a structured package; report those writes explicitly.
- Style references require user authorization before analysis.
- \`openathor style analyze\` creates a pending abstract style profile and reference record; do not treat it as confirmed project style until the user approves it.
- \`openathor style revise\` does not generate manuscript prose; it packages style guidance, shows diff/proposal, and hash-gates externally generated revised text.
- Never copy reference text phrasing as a style rule.

## Required User Confirmation

Ask before:

- deleting, archiving, moving, or renaming manuscript files
- changing confirmed canon
- confirming an asset sync that writes character, timeline, hook, or outline files
- resolving ambiguous chapter order
- writing style rules from reference texts
- applying or confirming a pending style profile
- making broad structural changes

## Final Response Shape

Keep the response short and concrete:

- what command was run
- what changed
- what needs user confirmation
- which files matter next
`;
