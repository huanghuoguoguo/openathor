import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import { detectCanonConflicts } from "./canon-conflict.js";
import type { EnvelopeWarning } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { normalizeManuscriptTextInput } from "./manuscript-text.js";
import { sha256File } from "./paths.js";
import {
  appendText,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runContext } from "./context-commands.js";
import { runStamp } from "./run-stamp.js";
import { ensureTrailingNewline } from "./text-format.js";
import {
  buildConfirmedDraftPlan,
  buildConfirmedRevisionPlan,
  confirmedDraftResultData,
  confirmedDraftRunRecord,
  confirmedDraftUpdates,
  confirmedRevisionResultData,
  confirmedRevisionRunRecord,
  confirmedRevisionUpdates,
  type WritingTarget,
} from "./writing-operations.js";
import type {
  CommandResult,
  WritingProposalOptions,
} from "./model.js";

export async function runConfirmedWriting(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  if (options.kind === "canon_sync") {
    return runConfirmedCanonSync(options, projectRoot, task, dryRun);
  }

  if (options.kind === "revise") {
    return runConfirmedRevision(options, projectRoot, task, dryRun);
  }

  if (options.kind !== "draft") {
    throw new OpenAthorError(
      "OA_CONFIRMED_WRITE_UNSUPPORTED",
      "Confirmed writes are currently supported only for draft chapter next, revise chapter, and canon sync.",
      { exitCode: 2 },
    );
  }

  if (options.target !== "next") {
    throw new OpenAthorError(
      "OA_CONFIRMED_WRITE_UNSUPPORTED",
      "Confirmed draft writes currently require target 'next' to avoid " +
        "overwriting existing manuscript files.",
      { exitCode: 2 },
    );
  }

  const normalizedText = normalizeOptionalManuscriptText(options.text);
  if (!normalizedText) {
    throw new OpenAthorError(
      "OA_DRAFT_TEXT_REQUIRED",
      "Confirmed draft writes require --text <manuscript text>.",
      { exitCode: 2 },
    );
  }

  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const plan = buildConfirmedDraftPlan(inspection, task, normalizedText.text, runStamp());
  const fullSourcePath = path.join(projectRoot, plan.sourcePath);
  let writtenContentHash: string | null = null;
  const warnings = confirmedDraftWarnings(
    inspection.warnings,
    plan,
    normalizedText.convertedEscapedNewlines,
  );

  if (await pathExists(fullSourcePath)) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_TARGET_EXISTS",
      `Refusing to overwrite existing manuscript file ${plan.sourcePath}.`,
      { exitCode: 3 },
    );
  }

  if (!dryRun) {
    await writeText(projectRoot, plan.sourcePath, ensureTrailingNewline(normalizedText.text));
    const contentHash = await sha256File(fullSourcePath);
    writtenContentHash = contentHash;
    const generatedAt = new Date().toISOString();
    const { chapters: updatedChapters, manuscriptIndex: updatedIndex } =
      confirmedDraftUpdates({
        state: inspection,
        plan,
        contentHash,
        generatedAt,
      });
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(
      projectRoot,
      plan.runRelPath,
      confirmedDraftRunRecord({
        task,
        sources: inspection.sources,
        plan,
        contentHash,
        createdAt: generatedAt,
      }),
    );
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : plan.writes,
    warnings,
    data: confirmedDraftResultData({
      dryRun,
      task,
      plan,
      contentHash: writtenContentHash,
    }),
  };
}

async function runConfirmedCanonSync(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  const normalizedText = normalizeOptionalManuscriptText(options.text);
  if (!normalizedText) {
    throw new OpenAthorError(
      "OA_CANON_TEXT_REQUIRED",
      "Confirmed canon sync writes require --text <confirmed canon text>.",
      { exitCode: 2 },
    );
  }

  if (!options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed canon sync writes require --base-hash <sha256:...> for bible/canon.md.",
      { exitCode: 2 },
    );
  }

  const context = await runContext({
    cwd: projectRoot,
    scope: options.target ? "chapter" : "project",
    target: options.target,
  });
  const conflicts = detectCanonConflicts(context.data, normalizedText.text);

  if (conflicts.length > 0) {
    throw new OpenAthorError(
      "OA_CANON_CONFLICT",
      `Confirmed canon text conflicts with ${conflicts.length} confirmed canon rule(s).`,
      {
        exitCode: 4,
        hints: conflicts.map((conflict) =>
          `${conflict.source}: ${conflict.statement}`,
        ),
      },
    );
  }

  const canonRelPath = "bible/canon.md";
  const canonPath = path.join(projectRoot, canonRelPath);
  const currentHash = await sha256File(canonPath);

  if (currentHash !== options.baseHash) {
    throw new OpenAthorError(
      "OA_CANON_CHANGED",
      "Refusing to sync confirmed canon because bible/canon.md changed.",
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${currentHash}.`,
          "Regenerate canon sync context and ask the user to confirm the latest canon.",
        ],
      },
    );
  }

  const target = contextTarget(context.data);
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_canon_sync_confirmed.json`;
  const writes = [
    {
      path: canonRelPath,
      change_type: "modified" as const,
      reason: "confirmed_canon_sync",
    },
    {
      path: runRelPath,
      change_type: "created" as const,
      reason: "confirmed_canon_sync_run_record",
    },
  ];
  let contentHash: string | null = null;

  if (!dryRun) {
    await appendText(
      projectRoot,
      canonRelPath,
      confirmedCanonEntryText({
        stamp,
        target,
        text: normalizedText.text,
      }),
    );
    contentHash = await sha256File(canonPath);
    await writeYaml(
      projectRoot,
      runRelPath,
      confirmedCanonRunRecord({
        task,
        text: normalizedText.text,
        target,
        baseHash: options.baseHash,
        contentHash,
        sources: context.sources ?? [],
        writes,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  return {
    projectRoot,
    projectId: context.projectId,
    sources: context.sources,
    writes: dryRun ? [] : writes,
    warnings: confirmedWritingTextWarnings(
      context.warnings ?? [],
      normalizedText.convertedEscapedNewlines,
    ),
    data: confirmedCanonResultData({
      dryRun,
      task,
      text: normalizedText.text,
      target,
      baseHash: options.baseHash,
      contentHash,
      runRelPath,
      writes,
    }),
  };
}

async function runConfirmedRevision(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  const normalizedText = normalizeOptionalManuscriptText(options.text);
  if (!normalizedText) {
    throw new OpenAthorError(
      "OA_REVISE_TEXT_REQUIRED",
      "Confirmed revision writes require --text <manuscript text>.",
      { exitCode: 2 },
    );
  }

  if (!options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed revision writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const chapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const fullSourcePath = path.join(projectRoot, chapter.source_path);
  const currentHash = await sha256File(fullSourcePath);

  if (currentHash !== options.baseHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to revise ${chapter.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${currentHash}.`,
          "Regenerate context and ask the user to confirm the latest text.",
        ],
      },
    );
  }

  const stamp = runStamp();
  const plan = buildConfirmedRevisionPlan({
    chapter,
    text: normalizedText.text,
    baseHash: options.baseHash,
    stamp,
  });
  let writtenContentHash: string | null = null;

  if (!dryRun) {
    await writeText(projectRoot, chapter.source_path, ensureTrailingNewline(normalizedText.text));
    const contentHash = await sha256File(fullSourcePath);
    writtenContentHash = contentHash;
    const generatedAt = new Date().toISOString();
    const { chapters: updatedChapters, manuscriptIndex: updatedIndex } =
      confirmedRevisionUpdates({
        state: inspection,
        plan,
        contentHash,
        generatedAt,
      });
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(
      projectRoot,
      plan.runRelPath,
      confirmedRevisionRunRecord({
        task,
        plan,
        sources: inspection.sources,
        contentHash,
        createdAt: generatedAt,
      }),
    );
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : plan.writes,
    warnings: confirmedWritingTextWarnings(
      inspection.warnings,
      normalizedText.convertedEscapedNewlines,
    ),
    data: confirmedRevisionResultData({
      dryRun,
      task,
      plan,
      contentHash: writtenContentHash,
    }),
  };
}

function normalizeOptionalManuscriptText(
  text: string | undefined,
): ReturnType<typeof normalizeManuscriptTextInput> | null {
  if (!text?.trim()) {
    return null;
  }

  const normalized = normalizeManuscriptTextInput(text);
  return normalized.text.trim() ? normalized : null;
}

function contextTarget(data: unknown): WritingTarget | null {
  const contextPack =
    typeof data === "object" &&
    data !== null &&
    "context_pack" in data &&
    typeof (data as { context_pack?: unknown }).context_pack === "object" &&
    (data as { context_pack?: unknown }).context_pack !== null
      ? (data as { context_pack: { target?: unknown } }).context_pack
      : null;
  const target = contextPack?.target;

  return typeof target === "object" && target !== null
    ? (target as WritingTarget)
    : null;
}

function confirmedCanonEntryText(input: {
  stamp: string;
  target: WritingTarget | null;
  text: string;
}): string {
  return [
    "",
    `## canon_${input.stamp}: Confirmed Canon Sync`,
    "",
    "- status: confirmed",
    `- source_ref: ${input.target?.id ?? "project"}`,
    `- source: ${input.target?.source_path ?? "context"}`,
    "",
    input.text.trim(),
    "",
  ].join("\n");
}

function confirmedCanonRunRecord(input: {
  task: string;
  text: string;
  target: WritingTarget | null;
  baseHash: string;
  contentHash: string;
  sources: NonNullable<CommandResult["sources"]>;
  writes: NonNullable<CommandResult["writes"]>;
  createdAt: string;
}): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    command: "openathor canon sync",
    created_at: input.createdAt,
    task: input.task,
    mode: "confirmed_write",
    target: input.target,
    confirmed_text: input.text,
    base_hash: input.baseHash,
    source_hash: input.contentHash,
    writes: input.writes,
    sources: input.sources,
    user_confirmation_required: false,
  };
}

function confirmedCanonResultData(input: {
  dryRun: boolean;
  task: string;
  text: string;
  target: WritingTarget | null;
  baseHash: string;
  contentHash: string | null;
  runRelPath: string;
  writes: NonNullable<CommandResult["writes"]>;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: "confirmed_write",
    command: "openathor canon sync",
    task: input.task,
    target: input.target,
    confirmed_text: input.text,
    canon_path: "bible/canon.md",
    base_hash: input.baseHash,
    source_hash: input.contentHash,
    planned_writes: input.dryRun ? input.writes : [],
    run_path: input.runRelPath,
    result: {
      applied: !input.dryRun,
      canon_modified: !input.dryRun,
      pending_canon_modified: false,
    },
    user_confirmation_required: false,
  };
}

function confirmedDraftWarnings(
  inspectionWarnings: EnvelopeWarning[],
  plan: ReturnType<typeof buildConfirmedDraftPlan>,
  convertedEscapedNewlines: boolean,
): EnvelopeWarning[] {
  const warnings = [...inspectionWarnings];

  if (convertedEscapedNewlines) {
    warnings.push(escapedNewlinesWarning());
  }

  if (
    plan.filledPlannedChapter &&
    plan.detectedTitle &&
    plan.plannedTitle &&
    plan.detectedTitle !== plan.plannedTitle
  ) {
    warnings.push({
      code: "OA_DRAFT_PLANNED_TITLE_MISMATCH",
      message:
        `Filled planned chapter ${plan.target.id} using outline title ` +
        `${JSON.stringify(plan.plannedTitle)}; manuscript title was ` +
        `${JSON.stringify(plan.detectedTitle)}.`,
      severity: "low",
    });
  }

  return warnings;
}

function confirmedWritingTextWarnings(
  inspectionWarnings: EnvelopeWarning[],
  convertedEscapedNewlines: boolean,
): EnvelopeWarning[] {
  return convertedEscapedNewlines
    ? [...inspectionWarnings, escapedNewlinesWarning()]
    : inspectionWarnings;
}

function escapedNewlinesWarning(): EnvelopeWarning {
  return {
    code: "OA_TEXT_ESCAPED_NEWLINES_NORMALIZED",
    message: "Converted escaped newline sequences in --text into manuscript line breaks.",
    severity: "low",
  };
}
