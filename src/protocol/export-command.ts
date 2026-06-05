import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import {
  ensureSafeRelativePath,
  sha256File,
} from "./paths.js";
import {
  defaultMarkdownExportPath,
  exportableManuscriptChapters,
  markdownExportData,
} from "./export-markdown.js";
import {
  addKnownSource,
  findProjectRoot,
  pathExists,
  writeText,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { ensureTrailingNewline } from "./text-format.js";
import type {
  CommandResult,
  ExportOptions,
} from "./model.js";

export async function runExport(options: ExportOptions = {}): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: false });
  const format = options.format ?? "markdown";
  const dryRun = options.dryRun ?? false;

  if (format !== "markdown") {
    throw new OpenAthorError(
      "OA_EXPORT_FORMAT_UNSUPPORTED",
      `Unsupported export format ${format}.`,
      {
        exitCode: 2,
        hints: ["Supported format: markdown."],
      },
    );
  }

  const outPath = options.out?.trim() || defaultMarkdownExportPath(inspection.config);
  ensureSafeRelativePath(outPath, "--out");

  const chapters = exportableManuscriptChapters(inspection.manuscriptIndex.chapters);
  const sourceMap = new Map<string, EnvelopeSource>();
  addKnownSource(sourceMap, inspection.sources, "openathor.yaml");
  addKnownSource(sourceMap, inspection.sources, "outline/chapters.yaml");
  addKnownSource(sourceMap, inspection.sources, inspection.config.paths.manuscript_index);

  const chapterParts = [];
  let totalChars = 0;

  for (const chapter of chapters) {
    const fullPath = path.join(projectRoot, chapter.source_path);
    if (!(await pathExists(fullPath))) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_SOURCE_MISSING",
        `Cannot export missing manuscript source ${chapter.source_path}.`,
        { exitCode: 3 },
      );
    }

    const text = await readFile(fullPath, "utf8");
    const hash = await sha256File(fullPath);
    sourceMap.set(chapter.source_path, { path: chapter.source_path, hash });
    const normalizedText = ensureTrailingNewline(text.trimEnd());
    totalChars += normalizedText.length;
    chapterParts.push(normalizedText);
  }

  const markdown = chapterParts.join("\n");
  const writes: EnvelopeWrite[] = [
    {
      path: outPath,
      change_type: (await pathExists(path.join(projectRoot, outPath))) ? "modified" : "created",
      reason: "export_markdown",
    },
  ];

  if (!dryRun) {
    await writeText(projectRoot, outPath, markdown);
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: markdownExportData({
      dryRun,
      format,
      outPath,
      chapters,
      totalChars,
      writes,
    }),
  };
}
