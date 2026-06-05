import path from "node:path";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  buildOutlineReplanPlan,
  normalizeOutlineReplanPackagePath,
  readOutlineReplanPackage,
  replanConfirmedWrites,
  replanDiff,
  replanPackageDiff,
  replanResult,
  replanSources,
  replanWrites,
  validateConfirmedReplanSafe,
} from "./outline-replan.js";
import {
  outlineTargetData,
  resolveOutlineTarget,
} from "./outline-target.js";
import {
  findProjectRoot,
  pathExists,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import {
  normalizeSnippetChars,
  snippetAround,
} from "./text-analysis.js";
import type {
  ChapterOutline,
  CommandResult,
  OutlineReplanOptions,
} from "./model.js";

export async function runOutlineReplan(
  options: OutlineReplanOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const from = resolveOutlineTarget(
    options.from,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const task = options.task?.trim();

  if (!task) {
    throw new OpenAthorError(
      "OA_TASK_REQUIRED",
      "openathor outline replan requires --task <text>.",
      { exitCode: 2 },
    );
  }

  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>(
    replanSources(inspection.sources).map((source) => [source.path, source]),
  );
  const outlineHash = await sha256File(path.join(projectRoot, "outline/chapters.yaml"));
  sourceMap.set("outline/chapters.yaml", {
    path: "outline/chapters.yaml",
    hash: outlineHash,
  });
  const indexedById = new Map(
    inspection.manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );
  const affected = inspection.chapters.chapters
    .filter((chapter) => chapter.display_order >= from.display_order)
    .sort((a, b) => a.display_order - b.display_order)
    .map((chapter) => {
      const indexedChapter = indexedById.get(chapter.id);
      return {
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        status: chapter.status,
        source_path: indexedChapter?.source_path ?? chapter.manuscript_path ?? null,
        summary: chapter.summary
          ? snippetAround(chapter.summary.replace(/\s+/g, " "), 0, 0, maxChars)
          : null,
      };
    });
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const packagePath = options.fromPackage
    ? normalizeOutlineReplanPackagePath(options.fromPackage)
    : null;
  const replanPackage = packagePath
    ? await readOutlineReplanPackage(projectRoot, packagePath, pathExists)
    : null;
  const plan = replanPackage
    ? buildOutlineReplanPlan(
        replanPackage,
        inspection.chapters.chapters,
        inspection.manuscriptIndex.chapters,
        from,
      )
    : null;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_replan.json`;

  if (packagePath) {
    sourceMap.set(packagePath, {
      path: packagePath,
      hash: await sha256File(path.join(projectRoot, packagePath)),
    });
  }

  const plannedWrites = plan
    ? replanConfirmedWrites(runRelPath)
    : replanWrites(affected);
  const result = plan
    ? replanResult(plan, false)
    : {
        applied: false,
        outline_modified: false,
        index_modified: false,
        manuscript_files_modified: false,
      };
  const data = {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline replan",
    task,
    from: outlineTargetData(from, null),
    replan_package_path: packagePath,
    affected_chapters: affected,
    replacement_chapters: plan?.replacement_chapters ?? [],
    result,
    user_confirmation_required: previewOnly,
    confirmed_write_supported: Boolean(plan),
    planned_writes: previewOnly ? plannedWrites : [],
    diff: plan ? replanPackageDiff(from, plan) : replanDiff(from, affected),
    next_agent_action: plan
      ? previewOnly
        ? "Show this replan package to the user, then rerun with --confirm --base-hash only after explicit approval."
        : "Run openathor outline show --json and refresh context before drafting the replanned chapters."
      : "Use this proposal as a planning boundary. To confirm a replan, prepare a structured package and rerun with --from-package.",
  };

  if (!previewOnly) {
    if (!plan || !packagePath) {
      throw new OpenAthorError(
        "OA_OUTLINE_REPLAN_PACKAGE_REQUIRED",
        "Confirmed replan writes require --from-package <replan-package.yaml|json>.",
        { exitCode: 2 },
      );
    }

    if (!options.baseHash) {
      throw new OpenAthorError(
        "OA_BASE_HASH_REQUIRED",
        "Confirmed replan writes require --base-hash <sha256:...> for outline/chapters.yaml.",
        { exitCode: 2 },
      );
    }

    if (options.baseHash !== outlineHash) {
      throw new OpenAthorError(
        "OA_OUTLINE_CHANGED",
        "Refusing to confirm replan because outline/chapters.yaml changed.",
        {
          exitCode: 3,
          hints: [
            `Expected ${options.baseHash}.`,
            `Current ${outlineHash}.`,
            "Regenerate the replan package from the latest outline before confirming.",
          ],
        },
      );
    }

    validateConfirmedReplanSafe(plan, inspection.manuscriptIndex);

    const updatedChapters: ChapterOutline = {
      chapters: [
        ...plan.preserved_before,
        ...plan.replacement_chapters,
      ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor outline replan",
      created_at: new Date().toISOString(),
      mode: "confirmed_write",
      task,
      from: outlineTargetData(from, null),
      base_hash: options.baseHash,
      replan_package_path: packagePath,
      replaced_chapters: plan.replaced_chapters,
      replacement_chapters: plan.replacement_chapters,
      writes: plannedWrites,
      sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
      user_confirmation_required: false,
    });

    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
      writes: plannedWrites,
      warnings: inspection.warnings,
      data: {
        ...data,
        result: replanResult(plan, true),
        user_confirmation_required: false,
        planned_writes: [],
        run_path: runRelPath,
      },
    };
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data,
  };
}
