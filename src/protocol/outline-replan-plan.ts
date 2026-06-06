import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
  OutlineReplanPackage,
  OutlineReplanPlan,
  ResolvedOutlineChapter,
} from "./model.js";

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
