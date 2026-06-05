import path from "node:path";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  mergeOutlineLinks,
  mergePlan,
  mergeProposalData,
  mergeWrites,
  mergedChapterText,
  mergedSummary,
} from "./outline-merge.js";
import {
  outlineTargetData,
  resolveOutlineTarget,
} from "./outline-target.js";
import {
  addKnownSource,
  findProjectRoot,
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
  OutlineMergeOptions,
} from "./model.js";

export async function runOutlineMerge(
  options: OutlineMergeOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const next = resolveOutlineTarget(
    options.next,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (target.id === next.id) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_INVALID",
      "Cannot merge a chapter with itself.",
      { exitCode: 2 },
    );
  }

  if (next.display_order !== target.display_order + 1) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_INVALID",
      "openathor outline merge currently requires adjacent chapters.",
      {
        exitCode: 2,
        hints: ["Use openathor outline move first if the chapters are not adjacent."],
      },
    );
  }

  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();
  addKnownSource(sourceMap, inspection.sources, "outline/chapters.yaml");
  addKnownSource(sourceMap, inspection.sources, inspection.config.paths.manuscript_index);
  const targetSource = target.source_path
    ? await readSourceText(projectRoot, target.source_path, sourceMap)
    : null;
  const nextSource = next.source_path
    ? await readSourceText(projectRoot, next.source_path, sourceMap)
    : null;
  const mergedTitle = options.title?.trim() || `${target.title} / ${next.title}`;
  const plan = mergePlan(target, next, mergedTitle, targetSource?.text, nextSource?.text, maxChars);
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_merge.json`;
  const plannedWrites = mergeWrites(target, next, runRelPath);

  if (confirm) {
    validateMergeConfirmation(options, target.id, next.id, target.source_path, next.source_path, {
      targetHash: targetSource?.hash,
      nextHash: nextSource?.hash,
    });
  }

  const mergeData = mergeProposalData(
    target,
    next,
    targetSource?.hash ?? null,
    nextSource?.hash ?? null,
    plan,
    dryRun,
    diff,
    previewOnly,
    plannedWrites,
  );

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
      writes: [],
      warnings: inspection.warnings,
      data: mergeData,
    };
  }

  const targetSourcePath = target.source_path;
  const nextSourcePath = next.source_path;

  if (!targetSourcePath || !nextSourcePath || !targetSource || !nextSource) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
      "Confirmed merge writes require both chapters to have manuscript source files.",
      { exitCode: 2 },
    );
  }

  const mergedText = ensureTrailingNewline(
    mergedChapterText(mergedTitle, targetSource.text, nextSource.text),
  );
  await writeText(projectRoot, targetSourcePath, mergedText);
  const mergedHash = await sha256File(path.join(projectRoot, targetSourcePath));
  const updatedChapters: ChapterOutline = {
    chapters: inspection.chapters.chapters.map((chapter) => {
      if (chapter.id === target.id) {
        return {
          ...chapter,
          title: mergedTitle,
          status: "revised" as const,
          manuscript_path: targetSourcePath,
          summary: mergedSummary(chapter.summary, next.outlineChapter?.summary),
          links: mergeOutlineLinks(chapter.links, next.outlineChapter?.links),
        };
      }

      if (chapter.id === next.id) {
        return {
          ...chapter,
          status: "archived" as const,
          manuscript_path: chapter.manuscript_path ?? nextSourcePath,
        };
      }

      return chapter;
    }),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: inspection.manuscriptIndex.chapters.map((chapter) => {
      if (chapter.id === target.id) {
        return {
          ...chapter,
          title: mergedTitle,
          status: "revised" as const,
          content_hash: mergedHash,
          detected_title: mergedTitle,
        };
      }

      if (chapter.id === next.id) {
        return {
          ...chapter,
          status: "archived" as const,
          content_hash: nextSource?.hash ?? chapter.content_hash,
        };
      }

      return chapter;
    }),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline merge",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, targetSource?.hash ?? null),
    next: outlineTargetData(next, nextSource?.hash ?? null),
    merged: {
      ...plan,
      content_hash: mergedHash,
    },
    base_hash: options.baseHash,
    next_base_hash: options.nextBaseHash,
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
      ...mergeData,
      mode: "confirmed_write",
      result: {
        applied: true,
        manuscript_file_modified: true,
        manuscript_files_deleted: false,
        outline_modified: true,
        index_modified: true,
        archived_chapter_id: next.id,
        target_content_hash: mergedHash,
      },
      user_confirmation_required: false,
      confirmed_write_supported: true,
      planned_writes: [],
      run_path: runRelPath,
      next_agent_action:
        "Run openathor outline show --json and refresh context before follow-up writing.",
    },
  };
}

function validateMergeConfirmation(
  options: OutlineMergeOptions,
  targetId: string,
  nextId: string,
  targetSourcePath: string | null,
  nextSourcePath: string | null,
  hashes: {
    targetHash?: string;
    nextHash?: string;
  },
): void {
  if (!targetSourcePath || !hashes.targetHash) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
      `Cannot merge into ${targetId} because it has no manuscript source file.`,
      { exitCode: 2 },
    );
  }

  if (!nextSourcePath || !hashes.nextHash) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
      `Cannot merge ${nextId} because it has no manuscript source file.`,
      { exitCode: 2 },
    );
  }

  if (!options.baseHash || !options.nextBaseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed merge writes require --base-hash <sha256:...> and --next-base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  if (options.baseHash !== hashes.targetHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to merge ${targetId} because the target source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${hashes.targetHash}.`,
          "Run openathor outline merge again before confirming the merge.",
        ],
      },
    );
  }

  if (options.nextBaseHash !== hashes.nextHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to merge ${nextId} because the next source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.nextBaseHash}.`,
          `Current ${hashes.nextHash}.`,
          "Run openathor outline merge again before confirming the merge.",
        ],
      },
    );
  }
}
