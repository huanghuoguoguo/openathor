import path from "node:path";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  normalizeSplitLine,
  outlineSplitParts,
  splitDisplayOrderById,
  splitProposalData,
  splitResult,
  splitSourcePath,
  splitSources,
  splitWrites,
} from "./outline-split.js";
import {
  outlineTargetData,
  resolveOutlineTarget,
  uniqueNewOutlineChapterId,
} from "./outline-target.js";
import {
  findProjectRoot,
  pathExists,
  readSourceText,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import { ensureTrailingNewline } from "./text-format.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import type {
  ChapterOutline,
  CommandResult,
  ManuscriptIndex,
  OutlineSplitOptions,
} from "./model.js";

export async function runOutlineSplit(
  options: OutlineSplitOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (!target.source_path) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_SOURCE_REQUIRED",
      `Cannot split ${target.id} because it has no manuscript source file.`,
      {
        exitCode: 2,
        hints: ["Use openathor outline show --json to inspect chapter source paths."],
      },
    );
  }

  const titleBefore = options.titleBefore?.trim();
  const titleAfter = options.titleAfter?.trim();

  if (!titleBefore || !titleAfter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TITLE_REQUIRED",
      "openathor outline split requires --title-before <title> and --title-after <title>.",
      { exitCode: 2 },
    );
  }

  const splitAtLine = normalizeSplitLine(options.atLine);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const targetSource = await readSourceText(projectRoot, target.source_path);
  const splitPlan = outlineSplitParts(
    targetSource.text,
    splitAtLine,
    titleBefore,
    titleAfter,
    maxChars,
  );
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const insertedOrder = target.display_order + 1;
  const insertedId = uniqueNewOutlineChapterId(
    insertedOrder,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const insertedSourcePath = splitSourcePath(target.source_path, insertedOrder, insertedId);
  const fullInsertedPath = path.join(projectRoot, insertedSourcePath);
  const shiftsIndexedChapters = inspection.manuscriptIndex.chapters.some(
    (chapter) => chapter.display_order >= insertedOrder && chapter.id !== target.id,
  );
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_split.json`;
  const plannedWrites = splitWrites(
    target,
    insertedSourcePath,
    runRelPath,
    shiftsIndexedChapters,
  );
  const splitData = splitProposalData(
    target,
    targetSource.hash,
    splitPlan,
    insertedId,
    insertedSourcePath,
    dryRun,
    diff,
    previewOnly,
    plannedWrites,
  );

  if (options.baseHash && options.baseHash !== targetSource.hash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to split ${target.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${targetSource.hash}.`,
          "Run openathor outline split again before confirming the split.",
        ],
      },
    );
  }

  if (confirm && !options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed split writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  if (!previewOnly && (await pathExists(fullInsertedPath))) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_TARGET_EXISTS",
      `Refusing to overwrite existing manuscript file ${insertedSourcePath}.`,
      { exitCode: 3 },
    );
  }

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
      writes: [],
      warnings: inspection.warnings,
      data: splitData,
    };
  }

  const beforeText = ensureTrailingNewline(splitPlan.before_text);
  const afterText = ensureTrailingNewline(splitPlan.after_text);
  await writeText(projectRoot, target.source_path, beforeText);
  await writeText(projectRoot, insertedSourcePath, afterText);
  const beforeHash = await sha256File(path.join(projectRoot, target.source_path));
  const afterHash = await sha256File(fullInsertedPath);
  const displayOrderById = splitDisplayOrderById(
    inspection.chapters,
    insertedOrder,
    target.id,
  );
  const updatedChapters: ChapterOutline = {
    chapters: [
      ...inspection.chapters.chapters.map((chapter) => {
        if (chapter.id === target.id) {
          return {
            ...chapter,
            title: splitPlan.before.title,
            status: "revised" as const,
            manuscript_path: target.source_path ?? undefined,
          };
        }

        return {
          ...chapter,
          display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
        };
      }),
      {
        id: insertedId,
        display_order: insertedOrder,
        title: splitPlan.after.title,
        status: "drafted" as const,
        manuscript_path: insertedSourcePath,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: [
      ...inspection.manuscriptIndex.chapters.map((chapter) => {
        if (chapter.id === target.id) {
          return {
            ...chapter,
            title: splitPlan.before.title,
            status: "revised" as const,
            content_hash: beforeHash,
            detected_title: splitPlan.before.title,
          };
        }

        return {
          ...chapter,
          display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
        };
      }),
      {
        id: insertedId,
        display_order: insertedOrder,
        title: splitPlan.after.title,
        source_path: insertedSourcePath,
        status: "drafted" as const,
        origin: "created" as const,
        content_hash: afterHash,
        detected_title: splitPlan.after.title,
        confidence: "high" as const,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline split",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, targetSource.hash),
    inserted: {
      id: insertedId,
      display_order: insertedOrder,
      title: splitPlan.after.title,
      source_path: insertedSourcePath,
      content_hash: afterHash,
    },
    split_at_line: splitPlan.split_at_line,
    base_hash: options.baseHash,
    writes: plannedWrites,
    sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...splitData,
      mode: "confirmed_write",
      planned_writes: [],
      confirmed_write_supported: true,
      run_path: runRelPath,
      result: splitResult(splitPlan, true),
      next_agent_action:
        "Run openathor outline show --json and refresh context before follow-up writing.",
    },
  };
}
