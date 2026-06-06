import path from "node:path";
import type { ChapterOutline } from "./model.js";
import { toPosix } from "./paths.js";

export function splitSourcePath(
  sourcePath: string,
  insertedOrder: number,
  insertedId: string,
): string {
  const dir = path.posix.dirname(toPosix(sourcePath));
  const ext = path.posix.extname(sourcePath) || ".md";
  const base = path.posix.basename(sourcePath, ext);
  return path.posix.join(
    dir,
    `${base}-split-${String(insertedOrder).padStart(3, "0")}-${insertedId}${ext}`,
  );
}

export function splitDisplayOrderById(
  chapters: ChapterOutline,
  insertedOrder: number,
  targetId: string,
): Map<string, number> {
  return new Map(
    chapters.chapters
      .filter((chapter) => chapter.id !== targetId && chapter.display_order >= insertedOrder)
      .map((chapter) => [chapter.id, chapter.display_order + 1]),
  );
}
