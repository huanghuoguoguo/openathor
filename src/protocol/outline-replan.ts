import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { OpenAthorError } from "./errors.js";
import type { EnvelopeSource, EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
  OutlineReplanChapterInput,
  OutlineReplanPackage,
  OutlineReplanPlan,
  ResolvedOutlineChapter,
} from "./model.js";
import {
  ensureSafeRelativePath,
  toPosix,
} from "./paths.js";
import { isPlainRecord, optionalString, stringArray } from "./value.js";

export function replanWrites(
  affected: Array<{ source_path: string | null }>,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "future_outline_replan_metadata",
    },
  ];

  if (affected.some((chapter) => chapter.source_path)) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "future_outline_replan_index",
    });
  }

  return writes;
}

export function replanConfirmedWrites(runRelPath: string): EnvelopeWrite[] {
  return [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "confirmed_outline_replan_metadata",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "confirmed_outline_replan_run_record",
    },
  ];
}

export function replanDiff(
  from: ResolvedOutlineChapter,
  affected: Array<{
    id: string;
    display_order: number;
    title: string;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Proposal only: define a replan boundary and affected chapters; no files are changed.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: "replan_from",
        from: null,
        to: from.id,
      },
      ...affected.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].review_for_replan`,
        from: chapter.display_order,
        to: chapter.title,
      })),
    ],
  };
}

export function replanPackageDiff(
  from: ResolvedOutlineChapter,
  plan: OutlineReplanPlan,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Replace planned future outline chapters from the replan boundary; no manuscript files are changed.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: "replan_from",
        from: null,
        to: from.id,
      },
      ...plan.replaced_chapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `remove_or_replace[${chapter.id}]`,
        from: chapter.title,
        to: null,
      })),
      ...plan.replacement_chapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}]`,
        from: null,
        to: chapter.title,
      })),
    ],
  };
}

export function replanResult(
  plan: OutlineReplanPlan,
  applied: boolean,
): {
  applied: boolean;
  outline_modified: boolean;
  index_modified: false;
  manuscript_files_modified: false;
  replaced_chapter_count: number;
  replacement_chapter_count: number;
  archived_index_chapter_count: number;
} {
  return {
    applied,
    outline_modified: applied,
    index_modified: false,
    manuscript_files_modified: false,
    replaced_chapter_count: plan.replaced_chapters.length,
    replacement_chapter_count: plan.replacement_chapters.length,
    archived_index_chapter_count: plan.archived_index_chapters.length,
  };
}

export async function readOutlineReplanPackage(
  projectRoot: string,
  safeRelPath: string,
  pathExists: (filePath: string) => Promise<boolean>,
): Promise<OutlineReplanPackage> {
  const fullPath = path.join(projectRoot, safeRelPath);

  if (!(await pathExists(fullPath))) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_NOT_FOUND",
      `Outline replan package not found: ${safeRelPath}`,
      { exitCode: 2 },
    );
  }

  const text = await readFile(fullPath, "utf8");
  let parsed: unknown;

  try {
    parsed =
      safeRelPath.endsWith(".json") || safeRelPath.endsWith(".jsonc")
        ? JSON.parse(text)
        : parseYaml(text);
  } catch (error) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      `Cannot parse outline replan package ${safeRelPath}: ${String(error)}`,
      { exitCode: 3 },
    );
  }

  return normalizeOutlineReplanPackage(parsed);
}

export function normalizeOutlineReplanPackagePath(relPath: string): string {
  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "--from-package");

  return safeRelPath;
}

export function buildOutlineReplanPlan(
  replanPackage: OutlineReplanPackage,
  chapters: ChapterOutlineEntry[],
  indexChapters: IndexedChapter[],
  from: ResolvedOutlineChapter,
): OutlineReplanPlan {
  const preservedBefore = chapters
    .filter((chapter) => chapter.display_order < from.display_order)
    .sort((a, b) => a.display_order - b.display_order);
  const replacedChapters = chapters
    .filter((chapter) => chapter.display_order >= from.display_order)
    .sort((a, b) => a.display_order - b.display_order);
  const archivedIndexChapters = indexChapters.filter(
    (chapter) => chapter.display_order >= from.display_order && chapter.status !== "archived",
  );
  const usedIds = new Set(preservedBefore.map((chapter) => chapter.id));
  const existingIds = new Set([
    ...chapters.map((chapter) => chapter.id),
    ...indexChapters.map((chapter) => chapter.id),
  ]);
  const replacementChapters = replanPackage.chapters.map((chapter, index) => {
    const displayOrder = from.display_order + index;
    const id = chapter.id ?? nextReplanChapterId(displayOrder, usedIds, existingIds);
    if (usedIds.has(id)) {
      throw invalidOutlineReplanItem(index, `id ${id} duplicates a preserved chapter`);
    }
    usedIds.add(id);
    existingIds.add(id);

    return {
      id,
      display_order: displayOrder,
      title: chapter.title,
      status: chapter.status,
      ...(chapter.summary ? { summary: chapter.summary } : {}),
      ...(chapter.scenes.length > 0 ? { scenes: chapter.scenes } : {}),
      ...(chapter.links ? { links: chapter.links } : {}),
    };
  });

  return {
    package: replanPackage,
    preserved_before: preservedBefore,
    replaced_chapters: replacedChapters,
    replacement_chapters: replacementChapters,
    archived_index_chapters: archivedIndexChapters,
  };
}

export function validateConfirmedReplanSafe(
  plan: OutlineReplanPlan,
  manuscriptIndex: ManuscriptIndex,
): void {
  const indexedById = new Map(manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]));
  const unsafe = plan.replaced_chapters.filter((chapter) => {
    if (chapter.status !== "planned") {
      return true;
    }
    if (chapter.manuscript_path) {
      return true;
    }
    return indexedById.has(chapter.id);
  });

  if (unsafe.length > 0) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_UNSAFE",
      "Confirmed replan can replace only planned chapters without manuscript sources.",
      {
        exitCode: 3,
        hints: unsafe
          .slice(0, 5)
          .map((chapter) => `${chapter.id} ${chapter.title} status=${chapter.status}`),
      },
    );
  }
}

export function replanSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeOutlineReplanPackage(value: unknown): OutlineReplanPackage {
  if (!isPlainRecord(value)) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      "Outline replan package must be a JSON/YAML object.",
      { exitCode: 3 },
    );
  }

  const chaptersValue = value.chapters;
  if (!Array.isArray(chaptersValue) || chaptersValue.length === 0) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      "Outline replan package requires non-empty chapters[].",
      { exitCode: 3 },
    );
  }

  return {
    chapters: chaptersValue.map((item, index) =>
      normalizeOutlineReplanChapterInput(item, index),
    ),
  };
}

function normalizeOutlineReplanChapterInput(
  value: unknown,
  index: number,
): OutlineReplanChapterInput {
  if (!isPlainRecord(value)) {
    throw invalidOutlineReplanItem(index, "must be an object");
  }

  const id = optionalString(value.id);
  if (id && !/^ch_[a-z0-9_]+$/.test(id)) {
    throw invalidOutlineReplanItem(index, `id ${id} is not a valid chapter id`);
  }

  const title = optionalString(value.title);
  if (!title) {
    throw invalidOutlineReplanItem(index, "requires title");
  }

  const status = optionalString(value.status) ?? "planned";
  if (status !== "planned") {
    throw invalidOutlineReplanItem(index, "confirmed replan package chapters must be planned");
  }

  const links = isPlainRecord(value.links) ? value.links : null;

  return {
    id,
    title,
    status,
    summary: optionalString(value.summary),
    scenes: stringArray(value.scenes),
    links,
  };
}

function invalidOutlineReplanItem(index: number, reason: string): OpenAthorError {
  return new OpenAthorError(
    "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
    `Invalid outline replan package item chapters.${index}: ${reason}.`,
    { exitCode: 3 },
  );
}

function nextReplanChapterId(
  displayOrder: number,
  usedIds: Set<string>,
  existingIds: Set<string>,
): string {
  let candidate = `ch_${String(displayOrder).padStart(3, "0")}`;
  let suffix = 2;

  while (usedIds.has(candidate) || existingIds.has(candidate)) {
    candidate = `ch_${String(displayOrder).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}
