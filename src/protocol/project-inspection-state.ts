import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  EnvelopeSource,
  EnvelopeWarning,
} from "./envelope.js";
import type {
  ChapterOutline,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";
import {
  hashSources,
  pathExists,
} from "./project-files.js";
import { STANDARD_ASSET_FILES } from "./project-layout.js";

export async function projectSources(
  projectRoot: string,
  config: ProjectConfig,
  manuscriptIndex: ManuscriptIndex,
): Promise<EnvelopeSource[]> {
  return hashSources(projectRoot, [
    "openathor.yaml",
    path.join(config.paths.outline, "chapters.yaml"),
    path.join(config.paths.outline, "volumes.yaml"),
    path.join(config.paths.outline, "scenes.yaml"),
    config.paths.manuscript_index,
    ...STANDARD_ASSET_FILES,
    ...manuscriptIndex.chapters.map((chapter) => chapter.source_path),
  ]);
}

export async function inspectionWarnings(
  projectRoot: string,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): Promise<EnvelopeWarning[]> {
  const warnings: EnvelopeWarning[] = [];

  for (const relPath of await missingStandardAssets(projectRoot)) {
    warnings.push({
      code: "OA_PROJECT_ASSET_MISSING",
      message: `Standard project asset is missing: ${relPath}`,
      severity: "medium",
    });
  }

  const indexedChapterIds = new Set(manuscriptIndex.chapters.map((chapter) => chapter.id));
  for (const chapter of chapters.chapters) {
    const shouldBeIndexed = chapter.status !== "planned" && chapter.manuscript_path;
    if (shouldBeIndexed && !indexedChapterIds.has(chapter.id)) {
      warnings.push({
        code: "OA_MANUSCRIPT_INDEX_STALE",
        message: `Manuscript index is missing outlined chapter ${chapter.id}.`,
        severity: "medium",
      });
    }
  }

  return warnings;
}

export async function missingStandardAssets(projectRoot: string): Promise<string[]> {
  const missing = [];

  for (const relPath of STANDARD_ASSET_FILES) {
    if (!(await pathExists(path.join(projectRoot, relPath)))) {
      missing.push(relPath);
    }
  }

  return missing;
}

export async function isIndexStale(
  root: string,
  config: ProjectConfig,
  sources: EnvelopeSource[],
): Promise<boolean> {
  const sqlitePath = path.join(root, config.paths.sqlite_index);

  if (!(await pathExists(sqlitePath))) {
    return true;
  }

  const sqliteStat = await stat(sqlitePath);

  for (const source of sources) {
    const sourceStat = await stat(path.join(root, source.path));
    if (sourceStat.mtimeMs > sqliteStat.mtimeMs + 1) {
      return true;
    }
  }

  return false;
}
