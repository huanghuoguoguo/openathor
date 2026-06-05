export const PI_SKILL_TEXT = `# OpenAthor Pi Skill

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
openathor search text "<query>" --json
openathor search related chapter <id-or-order> --json
openathor search semantic "<query>" --json
openathor outline show --json
openathor outline impact <id-or-order> --json
openathor style check chapter <id-or-order> --json
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
7. Use \`openathor assets audit --json\` after longform asset, outline, or manuscript changes to check unresolved links and drift.
8. Use \`openathor style check chapter <id-or-order> --json\` after drafting or revising a chapter when style consistency matters.
9. Use \`openathor outline impact <id-or-order> --json\` before proposing any chapter archive/delete action.

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
openathor revise chapter <id-or-order> --task "<task>" --json
openathor canon sync <id-or-order> --task "<task>" --json
\`\`\`

Confirmed new-chapter write is allowed only after explicit user confirmation:

\`\`\`bash
openathor draft chapter next --task "<task>" --text "<manuscript>" --confirm-write --json
\`\`\`

For confirmed new-chapter writes, make the first line of \`--text\` a Markdown H1 title, for example \`# 最后一班车\`. OpenAthor uses that heading as the chapter title in outline and index metadata.

Confirmed revision is allowed only with a fresh source hash:

\`\`\`bash
openathor revise chapter <id-or-order> --task "<task>" --text "<manuscript>" --base-hash "sha256:..." --confirm-write --json
\`\`\`

When using proposal commands:

- do not pretend OpenAthor has generated or revised manuscript text
- use \`openathor context --json\` or \`openathor context chapter <id-or-order> --json\` before writing advice
- do not overwrite user manuscript files
- use confirmed draft writes only for \`chapter next\`; do not overwrite existing chapter files
- use confirmed revision only when the source hash comes from the latest \`openathor context\` or \`openathor doctor\` output
- for writing advice, read relevant plaintext sources and provide suggestions in the conversation
- after writing or revising longform assets, run \`openathor assets audit --json\` and report unresolved links or drift before claiming continuity is stable
- after writing or revising chapter prose, run \`openathor style check chapter <id-or-order> --json\` when style stability is part of the task; treat findings as review prompts, not automatic edits
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

Confirmed merge and confirmed replan are not implemented. Do not edit outline/index manually to simulate them.

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
- Style references require user authorization before analysis.
- Never copy reference text phrasing as a style rule.

## Required User Confirmation

Ask before:

- deleting, archiving, moving, or renaming manuscript files
- changing confirmed canon
- resolving ambiguous chapter order
- writing style rules from reference texts
- making broad structural changes

## Final Response Shape

Keep the response short and concrete:

- what command was run
- what changed
- what needs user confirmation
- which files matter next
`;
