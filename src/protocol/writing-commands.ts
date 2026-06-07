import path from "node:path";
import { detectCanonConflicts } from "./canon-conflict.js";
import { runContext } from "./context-commands.js";
import { OpenAthorError } from "./errors.js";
import {
  appendText,
  findProjectRoot,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import {
  buildReviewPack,
  normalizeReviewRoleIds,
} from "./review-pack.js";
import { runStamp } from "./run-stamp.js";
import { runConfirmedWriting } from "./writing-confirmed-command.js";
import {
  buildWritingProposalPlan,
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
  const reviewRoleIds = normalizeReviewRoleIds(options);
  const confirmedWrite = options.confirmWrite || options.confirm;

  if (!task) {
    throw new OpenAthorError(
      "OA_TASK_REQUIRED",
      `${proposalCommandName(options.kind)} requires --task <text>.`,
      { exitCode: 2 },
    );
  }

  if (confirmedWrite && diff) {
    throw new OpenAthorError(
      "OA_DIFF_CONFIRM_CONFLICT",
      "--diff cannot be combined with confirmed write options.",
      { exitCode: 2 },
    );
  }

  if (confirmedWrite) {
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
  const reviewPack = buildReviewPack({
    target: proposalTarget,
    roleIds: reviewRoleIds,
  });
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
    contextPack: contextData.context_pack,
    reviewPack,
  });

  if (!dryRun && !diff) {
    const runRecord = writingProposalRunRecord({
      plan,
      task,
      target: proposalTarget,
      sources: context.sources ?? [],
      createdAt: new Date().toISOString(),
      reviewPack,
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
      reviewPack,
    }),
  };
}
