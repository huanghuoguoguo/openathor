import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import { detectCanonConflicts } from "./canon-conflict.js";
import type { EnvelopeWarning } from "./envelope.js";
import { runContext } from "./context-commands.js";
import { OpenAthorError } from "./errors.js";
import { normalizeManuscriptTextInput } from "./manuscript-text.js";
import { sha256File } from "./paths.js";
import {
  appendText,
  findProjectRoot,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import { ensureTrailingNewline } from "./text-format.js";
import {
  buildConfirmedDraftPlan,
  buildConfirmedRevisionPlan,
  buildWritingProposalPlan,
  confirmedDraftResultData,
  confirmedDraftRunRecord,
  confirmedDraftUpdates,
  confirmedRevisionResultData,
  confirmedRevisionRunRecord,
  confirmedRevisionUpdates,
  nextDraftTargetPreview,
  proposalCommandName,
  proposalNeedsChapter,
  writingProposalData,
  writingProposalPath,
  writingProposalRunRecord,
  writingProposalText,
  type WritingTarget,
} from "./writing-operations.js";
import type {
  CommandResult,
  WritingProposalOptions,
} from "./model.js";

export async function runWritingProposal(
  options: WritingProposalOptions,
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const dryRun = options.dryRun ?? false;
  const diff = options.diff ?? false;
  const task = options.task?.trim();

  if (!task) {
    throw new OpenAthorError(
      "OA_TASK_REQUIRED",
      `${proposalCommandName(options.kind)} requires --task <text>.`,
      { exitCode: 2 },
    );
  }

  if (options.confirmWrite && diff) {
    throw new OpenAthorError(
      "OA_DIFF_CONFIRM_CONFLICT",
      "--diff cannot be combined with --confirm-write.",
      { exitCode: 2 },
    );
  }

  if (options.confirmWrite) {
    return runConfirmedWriting(options, projectRoot, task, dryRun);
  }

  const context = await runContext({
    cwd: projectRoot,
    scope: proposalNeedsChapter(options) ? "chapter" : "project",
    target: proposalNeedsChapter(options) ? options.target : undefined,
  });
  const contextData = context.data as {
    context_pack: {
      scope: string;
      target: WritingTarget | null;
    };
  };
  const proposalTarget =
    options.kind === "draft" && options.target === "next"
      ? nextDraftTargetPreview(
          await inspectProject(projectRoot, { includeIndexWarning: true }),
          task,
        )
      : contextData.context_pack.target;
  const conflicts = detectCanonConflicts(context.data, task);

  if (conflicts.length > 0) {
    throw new OpenAthorError(
      "OA_CANON_CONFLICT",
      `User task conflicts with ${conflicts.length} confirmed canon rule(s).`,
      {
        exitCode: 4,
        hints: conflicts.map((conflict) =>
          `${conflict.source}: ${conflict.statement}`,
        ),
      },
    );
  }

  const stamp = runStamp();
  const proposalRelPath = writingProposalPath(options.kind, stamp, proposalTarget);
  const plan = buildWritingProposalPlan({
    kind: options.kind,
    stamp,
    target: proposalTarget,
    proposalExists: await pathExists(path.join(projectRoot, proposalRelPath)),
  });

  const proposalText = writingProposalText({
    kind: options.kind,
    task,
    stamp,
    target: proposalTarget,
  });

  if (!dryRun && !diff) {
    const runRecord = writingProposalRunRecord({
      plan,
      task,
      target: proposalTarget,
      sources: context.sources ?? [],
      createdAt: new Date().toISOString(),
    });
    await writeYaml(projectRoot, plan.runRelPath, runRecord);

    if (options.kind === "canon_sync") {
      await appendText(projectRoot, plan.proposalRelPath, proposalText);
    } else {
      await writeText(projectRoot, plan.proposalRelPath, proposalText);
    }
  }

  return {
    projectRoot,
    projectId: context.projectId,
    sources: context.sources,
    writes: dryRun || diff ? [] : plan.writes,
    warnings: context.warnings,
    data: writingProposalData({
      dryRun,
      diff,
      kind: options.kind,
      task,
      target: proposalTarget,
      contextPack: contextData.context_pack,
      plan,
      proposalText,
    }),
  };
}

async function runConfirmedWriting(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  if (options.kind === "revise") {
    return runConfirmedRevision(options, projectRoot, task, dryRun);
  }

  if (options.kind !== "draft") {
    throw new OpenAthorError(
      "OA_CONFIRMED_WRITE_UNSUPPORTED",
      "Confirmed writes are currently supported only for draft chapter next and revise chapter.",
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
