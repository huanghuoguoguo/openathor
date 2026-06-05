import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
  ResolvedOutlineChapter,
} from "./model.js";

export function resolveOutlineTarget(
  target: string | undefined,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): ResolvedOutlineChapter {
  if (!target) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_REQUIRED",
      "openathor outline requires a chapter id or display order.",
      { exitCode: 2 },
    );
  }

  const outlineChapter =
    chapters.chapters.find(
      (chapter) => chapter.id === target || String(chapter.display_order) === target,
    ) ?? null;
  const indexedChapter =
    manuscriptIndex.chapters.find(
      (chapter) =>
        chapter.id === target ||
        String(chapter.display_order) === target ||
        chapter.id === outlineChapter?.id,
    ) ?? null;

  if (!outlineChapter && !indexedChapter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${target}.`,
      {
        exitCode: 2,
        hints: ["Use openathor outline show --json to inspect chapter ids."],
      },
    );
  }

  const id = outlineChapter?.id ?? indexedChapter?.id ?? target;
  const displayOrder =
    outlineChapter?.display_order ?? indexedChapter?.display_order ?? Number(target);
  const title = outlineChapter?.title ?? indexedChapter?.title ?? id;
  const sourcePath =
    indexedChapter?.source_path ?? outlineChapter?.manuscript_path ?? null;

  return {
    input: target,
    outlineChapter,
    indexedChapter,
    id,
    display_order: displayOrder,
    title,
    source_path: sourcePath,
    outline_status: outlineChapter?.status ?? null,
    index_status: indexedChapter?.status ?? null,
  };
}

export function outlineTargetData(
  target: ResolvedOutlineChapter,
  sourceHash: string | null,
): {
  input: string;
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  source_hash: string | null;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
} {
  return {
    input: target.input,
    id: target.id,
    display_order: target.display_order,
    title: target.title,
    source_path: target.source_path,
    source_hash: sourceHash,
    outline_status: target.outline_status,
    index_status: target.index_status,
  };
}

export function uniqueNewOutlineChapterId(
  order: number,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): string {
  const existing = new Set([
    ...chapters.chapters.map((chapter) => chapter.id),
    ...manuscriptIndex.chapters.map((chapter) => chapter.id),
  ]);
  let candidate = `ch_${String(order).padStart(3, "0")}`;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `ch_${String(order).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}
