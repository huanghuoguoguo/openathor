import path from "node:path";
import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
} from "./model.js";
import { ensureSafeRelativePath, sha256File } from "./paths.js";
import { pathExists } from "./project-files.js";

export async function rebuildManuscriptIndexFromOutline(
  projectRoot: string,
  chapters: ChapterOutline,
  currentIndex: ManuscriptIndex,
): Promise<ManuscriptIndex> {
  const currentById = new Map(currentIndex.chapters.map((chapter) => [chapter.id, chapter]));
  const rebuilt: IndexedChapter[] = [];

  for (const chapter of [...chapters.chapters].sort((a, b) => a.display_order - b.display_order)) {
    if (chapter.status === "planned" || !chapter.manuscript_path) {
      continue;
    }

    ensureSafeRelativePath(chapter.manuscript_path, "chapters.manuscript_path");
    const fullPath = path.join(projectRoot, chapter.manuscript_path);
    if (!(await pathExists(fullPath))) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_MISSING_SOURCE",
        `Missing manuscript source file: ${chapter.manuscript_path}`,
        { exitCode: 3 },
      );
    }

    const existing = currentById.get(chapter.id);
    rebuilt.push({
      id: chapter.id,
      display_order: chapter.display_order,
      title: chapter.title,
      source_path: chapter.manuscript_path,
      status: outlineStatusToIndexStatus(chapter.status),
      origin: existing?.origin ?? currentIndex.source_mode,
      content_hash: await sha256File(fullPath),
      detected_title: existing?.detected_title ?? chapter.title,
      confidence: existing?.confidence ?? "high",
    });
  }

  return {
    ...currentIndex,
    generated_at: new Date().toISOString(),
    chapters: rebuilt,
  };
}

function outlineStatusToIndexStatus(status: ChapterOutlineEntry["status"]): IndexedChapter["status"] {
  if (status === "archived") {
    return "archived";
  }

  if (status === "revised") {
    return "revised";
  }

  return "drafted";
}
