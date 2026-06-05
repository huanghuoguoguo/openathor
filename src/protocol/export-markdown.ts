import type { EnvelopeWrite } from "./envelope.js";
import type { IndexedChapter, ProjectConfig } from "./model.js";
import { slugAscii } from "./identifiers.js";

export function defaultMarkdownExportPath(config: ProjectConfig): string {
  const filename = `${slugAscii(config.project.title) || "manuscript"}.md`;
  return `exports/${filename}`;
}

export function exportableManuscriptChapters(chapters: IndexedChapter[]): IndexedChapter[] {
  return chapters
    .filter((chapter) => chapter.status !== "archived")
    .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
}

export function markdownExportData(input: {
  dryRun: boolean;
  format: string;
  outPath: string;
  chapters: IndexedChapter[];
  totalChars: number;
  writes: EnvelopeWrite[];
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    format: input.format,
    out_path: input.outPath,
    chapter_count: input.chapters.length,
    chapters: input.chapters.map((chapter) => ({
      id: chapter.id,
      display_order: chapter.display_order,
      title: chapter.title,
      source_path: chapter.source_path,
      status: chapter.status,
    })),
    char_count: input.totalChars,
    planned_writes: input.dryRun ? input.writes : [],
  };
}
