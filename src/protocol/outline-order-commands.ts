import path from "node:path";
import { OpenAthorError } from "./errors.js";
import {
  insertAffectedChapters,
  insertDiff,
  insertResult,
  insertSources,
  insertWrites,
  moveDiff,
  moveDisplayOrderChanges,
  moveResult,
  moveSources,
  moveWrites,
} from "./outline-order.js";
import {
  outlineTargetData,
  resolveOutlineTarget,
  uniqueNewOutlineChapterId,
} from "./outline-target.js";
import {
  findProjectRoot,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  CommandResult,
  ManuscriptIndex,
  OutlineInsertOptions,
  OutlineMoveOptions,
} from "./model.js";

export async function runOutlineInsert(
  options: OutlineInsertOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const after = resolveOutlineTarget(
    options.after,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const title = options.title?.trim();

  if (!title) {
    throw new OpenAthorError(
      "OA_OUTLINE_TITLE_REQUIRED",
      "openathor outline insert requires --title <title>.",
      { exitCode: 2 },
    );
  }

  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const insertOrder = after.display_order + 1;
  const chapterId = uniqueNewOutlineChapterId(
    insertOrder,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_insert.json`;
  const shiftsIndexedChapters = inspection.manuscriptIndex.chapters.some(
    (chapter) => chapter.display_order >= insertOrder,
  );
  const plannedWrites = insertWrites(runRelPath, shiftsIndexedChapters);
  const affectedChapters = insertAffectedChapters(
    inspection.chapters,
    inspection.manuscriptIndex,
    insertOrder,
  );
  const insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  } = {
    id: chapterId,
    display_order: insertOrder,
    title,
    status: "planned" as const,
    manuscript_path: null,
  };
  const data = {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline insert",
    after: outlineTargetData(after, null),
    inserted: insertedChapter,
    result: insertResult(insertedChapter, affectedChapters, false),
    user_confirmation_required: !confirm,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: insertDiff(after, insertedChapter, affectedChapters),
    next_agent_action: previewOnly
      ? "Show the planned structural change to the user and rerun with --confirm only after explicit approval."
      : "Run openathor outline show --json and refresh context before drafting the inserted chapter.",
  };

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: insertSources(inspection.sources),
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  const updatedChapters: ChapterOutline = {
    chapters: [
      ...inspection.chapters.chapters.map((chapter) =>
        chapter.display_order >= insertOrder
          ? {
              ...chapter,
              display_order: chapter.display_order + 1,
            }
          : chapter,
      ),
      {
        id: chapterId,
        display_order: insertOrder,
        title,
        status: "planned" as const,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);

  if (shiftsIndexedChapters) {
    const updatedIndex: ManuscriptIndex = {
      ...inspection.manuscriptIndex,
      generated_at: new Date().toISOString(),
      chapters: inspection.manuscriptIndex.chapters
        .map((chapter) =>
          chapter.display_order >= insertOrder
            ? {
                ...chapter,
                display_order: chapter.display_order + 1,
              }
            : chapter,
        )
        .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
    };

    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  }

  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline insert",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    after: outlineTargetData(after, null),
    inserted: insertedChapter,
    affected_chapters: affectedChapters,
    manuscript_file_created: false,
    writes: plannedWrites,
    sources: insertSources(inspection.sources),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: insertSources(inspection.sources),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...data,
      planned_writes: [],
      result: insertResult(insertedChapter, affectedChapters, true),
    },
  };
}

export async function runOutlineMove(
  options: OutlineMoveOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const after = resolveOutlineTarget(
    options.after,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (target.id === after.id) {
    throw new OpenAthorError(
      "OA_OUTLINE_MOVE_INVALID",
      "Cannot move a chapter after itself.",
      { exitCode: 2 },
    );
  }

  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const movedChapters = moveDisplayOrderChanges(inspection.chapters, target.id, after.id);
  const noOp = movedChapters.length === 0;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_move.json`;
  const plannedWrites = moveWrites(runRelPath, movedChapters);
  const data = {
    dry_run: dryRun,
    mode: noOp ? "no_op" : previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline move",
    target: outlineTargetData(target, null),
    after: outlineTargetData(after, null),
    result: moveResult(target, after, movedChapters, false),
    user_confirmation_required: noOp ? false : !confirm,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: moveDiff(target, after, movedChapters),
    next_agent_action: noOp
      ? "No order change is needed."
      : previewOnly
        ? "Show the planned order change to the user and rerun with --confirm only after explicit approval."
        : "Run openathor outline show --json and refresh context before follow-up writing.",
  };

  if (noOp || previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: moveSources(inspection.sources),
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  const displayOrderById = new Map(
    movedChapters.map((chapter) => [chapter.id, chapter.to_display_order]),
  );
  const updatedChapters: ChapterOutline = {
    chapters: inspection.chapters.chapters
      .map((chapter) => ({
        ...chapter,
        display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
      }))
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: inspection.manuscriptIndex.chapters
      .map((chapter) => ({
        ...chapter,
        display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
      }))
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline move",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, null),
    after: outlineTargetData(after, null),
    moved_chapters: movedChapters,
    manuscript_files_moved: false,
    writes: plannedWrites,
    sources: moveSources(inspection.sources),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: moveSources(inspection.sources),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...data,
      planned_writes: [],
      result: moveResult(target, after, movedChapters, true),
    },
  };
}
