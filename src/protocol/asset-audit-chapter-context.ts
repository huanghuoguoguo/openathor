import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectInspection } from "./project-inspection.js";

export type AuditChapter = ProjectInspection["chapters"]["chapters"][number];

export type AssetAuditChapterContext = {
  chapter: AuditChapter;
  sourcePath: string | null;
  chapterText: string;
  fullText: string;
};

export async function readAssetAuditChapterContext(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  chapter: AuditChapter;
}): Promise<AssetAuditChapterContext> {
  const indexedChapter =
    input.inspection.manuscriptIndex.chapters.find(
      (candidate) => candidate.id === input.chapter.id,
    ) ?? null;
  const sourcePath = indexedChapter?.source_path ?? input.chapter.manuscript_path ?? null;
  const chapterText = sourcePath
    ? await readFile(path.join(input.projectRoot, sourcePath), "utf8")
    : "";

  return {
    chapter: input.chapter,
    sourcePath,
    chapterText,
    fullText: [input.chapter.title, input.chapter.summary ?? "", chapterText].join("\n"),
  };
}