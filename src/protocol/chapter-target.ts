import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutline,
  IndexedChapter,
  ManuscriptIndex,
} from "./model.js";

export function resolveContextChapter(
  target: string | undefined,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): IndexedChapter {
  if (!target) {
    throw new OpenAthorError(
      "OA_CONTEXT_TARGET_REQUIRED",
      "openathor context chapter requires a chapter id or display order.",
      { exitCode: 2 },
    );
  }

  const outlineChapter = chapters.chapters.find((chapter) => {
    return chapter.id === target || String(chapter.display_order) === target;
  });

  const indexedChapter = manuscriptIndex.chapters.find((chapter) => {
    return (
      chapter.id === target ||
      String(chapter.display_order) === target ||
      chapter.id === outlineChapter?.id
    );
  });

  if (!indexedChapter) {
    throw new OpenAthorError(
      "OA_CONTEXT_TARGET_NOT_FOUND",
      `Cannot find chapter target ${target}.`,
      {
        exitCode: 2,
        hints: ["Use openathor doctor --json to inspect indexed chapters."],
      },
    );
  }

  return indexedChapter;
}
