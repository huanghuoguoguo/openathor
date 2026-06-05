import type {
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
} from "./model.js";
import { titleFromTask } from "./title.js";
import type {
  WritingProjectState,
  WritingTarget,
} from "./writing-types.js";

export function nextDraftTargetPreview(
  state: WritingProjectState,
  task: string,
): WritingTarget {
  const plannedChapter = nextDraftablePlannedChapter(state);
  const nextOrder = plannedChapter?.display_order ?? nextDisplayOrder(state.manuscriptIndex);
  const chapterId =
    plannedChapter?.id ?? uniqueNewChapterId(nextOrder, state.manuscriptIndex);
  const title =
    titleFromTask(task) ??
    plannedChapter?.title ??
    state.config.project.title ??
    `Chapter ${nextOrder}`;

  return {
    id: chapterId,
    display_order: nextOrder,
    title,
    source_path: manuscriptPathForOrder(nextOrder),
  };
}

export function nextDisplayOrder(index: ManuscriptIndex): number {
  const currentMax = index.chapters.reduce(
    (max, chapter) => Math.max(max, chapter.display_order),
    0,
  );
  return currentMax + 1;
}

export function nextDraftablePlannedChapter(state: {
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
}): ChapterOutlineEntry | null {
  const indexedIds = new Set(state.manuscriptIndex.chapters.map((chapter) => chapter.id));

  return (
    [...state.chapters.chapters]
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
      .find(
        (chapter) =>
          chapter.status === "planned" &&
          !chapter.manuscript_path &&
          !indexedIds.has(chapter.id),
      ) ?? null
  );
}

export function uniqueNewChapterId(order: number, index: ManuscriptIndex): string {
  const existing = new Set(index.chapters.map((chapter) => chapter.id));
  let candidate = `ch_${String(order).padStart(3, "0")}`;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `ch_${String(order).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function manuscriptPathForOrder(order: number): string {
  return `manuscript/chapter-${String(order).padStart(3, "0")}.md`;
}
