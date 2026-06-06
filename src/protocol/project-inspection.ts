import path from "node:path";
import { PROTOCOL_VERSION } from "./constants.js";
import type { EnvelopeWarning } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutline,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";
import { ensureSafeRelativePath } from "./paths.js";
import {
  isDirectory,
  pathExists,
} from "./project-files.js";
export type {
  ProjectChecks,
  ProjectInspection,
} from "./project-inspection-model.js";
import type { ProjectInspection } from "./project-inspection-model.js";
import {
  inspectionWarnings,
  isIndexStale,
  missingStandardAssets,
  projectSources,
} from "./project-inspection-state.js";
import { readYamlFile, validateSchema } from "./schema.js";

export async function inspectProject(
  projectRoot: string,
  options: { includeIndexWarning: boolean },
): Promise<ProjectInspection> {
  const configPath = path.join(projectRoot, "openathor.yaml");
  const rawConfig = await readYamlFile(configPath);
  await validateSchema("openathor", rawConfig, "openathor.yaml");
  const config = rawConfig as ProjectConfig;

  if (config.protocol_version !== PROTOCOL_VERSION) {
    throw new OpenAthorError(
      "OA_PROTOCOL_UNSUPPORTED",
      `Unsupported protocol_version ${config.protocol_version}.`,
      { exitCode: 3 },
    );
  }

  for (const [field, relPath] of Object.entries(config.paths)) {
    ensureSafeRelativePath(relPath, `paths.${field}`);
  }

  const requiredPaths = [
    config.paths.bible,
    config.paths.outline,
    config.paths.manuscript,
    config.paths.notes,
    config.paths.reviews,
    config.paths.runs,
    path.dirname(config.paths.manuscript_index),
  ];

  for (const relPath of requiredPaths) {
    if (!(await isDirectory(path.join(projectRoot, relPath)))) {
      throw new OpenAthorError(
        "OA_PROJECT_NOT_FOUND",
        `Required directory is missing: ${relPath}`,
        { exitCode: 3 },
      );
    }
  }

  const chaptersRel = path.join(config.paths.outline, "chapters.yaml");
  const volumesRel = path.join(config.paths.outline, "volumes.yaml");
  const scenesRel = path.join(config.paths.outline, "scenes.yaml");
  const manuscriptIndexRel = config.paths.manuscript_index;

  const rawChapters = await readYamlFile(path.join(projectRoot, chaptersRel));
  await validateSchema("chapters", rawChapters, chaptersRel);
  const chapters = rawChapters as ChapterOutline;

  if (await pathExists(path.join(projectRoot, volumesRel))) {
    const rawVolumes = await readYamlFile(path.join(projectRoot, volumesRel));
    await validateSchema("volumes", rawVolumes, volumesRel);
  }

  if (await pathExists(path.join(projectRoot, scenesRel))) {
    const rawScenes = await readYamlFile(path.join(projectRoot, scenesRel));
    await validateSchema("scenes", rawScenes, scenesRel);
  }

  const rawIndex = await readYamlFile(path.join(projectRoot, manuscriptIndexRel));
  await validateSchema("manuscript-index", rawIndex, manuscriptIndexRel);
  const manuscriptIndex = rawIndex as ManuscriptIndex;

  const chapterIds = new Set<string>();
  const displayOrders = new Set<number>();

  for (const chapter of chapters.chapters) {
    if (chapterIds.has(chapter.id)) {
      throw new OpenAthorError(
        "OA_OUTLINE_DUPLICATE_ID",
        `Duplicate chapter id ${chapter.id}.`,
        { exitCode: 3 },
      );
    }

    if (displayOrders.has(chapter.display_order)) {
      throw new OpenAthorError(
        "OA_OUTLINE_DUPLICATE_ID",
        `Duplicate chapter display_order ${chapter.display_order}.`,
        { exitCode: 3 },
      );
    }

    chapterIds.add(chapter.id);
    displayOrders.add(chapter.display_order);
  }

  for (const chapter of manuscriptIndex.chapters) {
    ensureSafeRelativePath(chapter.source_path, "chapters.source_path");

    if (!(await pathExists(path.join(projectRoot, chapter.source_path)))) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_MISSING_SOURCE",
        `Missing manuscript source file: ${chapter.source_path}`,
        { exitCode: 3 },
      );
    }
  }

  const sources = await projectSources(projectRoot, config, manuscriptIndex);
  const warnings = await inspectionWarnings(projectRoot, chapters, manuscriptIndex);

  if (options.includeIndexWarning && (await isIndexStale(projectRoot, config, sources))) {
    warnings.push({
      code: "OA_INDEX_STALE",
      message: "The derived SQLite index is missing or older than source files.",
      severity: "medium",
    });
  }

  return {
    config,
    chapters,
    manuscriptIndex,
    sources,
    warnings,
    checks: {
      openathor_yaml: true,
      protocol_version: true,
      required_directories: true,
      outline_chapters: true,
      manuscript_index: true,
      chapter_ids_unique: true,
      display_order_unique: true,
      source_paths_exist: true,
      standard_assets_present: !warnings.some(
        (warning) => warning.code === "OA_PROJECT_ASSET_MISSING",
      ),
      manuscript_index_matches_outline: !warnings.some(
        (warning) => warning.code === "OA_MANUSCRIPT_INDEX_STALE",
      ),
      derived_index_current: warnings.length === 0,
    },
  };
}

export async function inspectionWithManuscriptIndex(
  projectRoot: string,
  inspection: ProjectInspection,
  manuscriptIndex: ManuscriptIndex,
): Promise<ProjectInspection> {
  const sources = await projectSources(projectRoot, inspection.config, manuscriptIndex);
  const assetMissing = await missingStandardAssets(projectRoot);
  const warnings: EnvelopeWarning[] = assetMissing.map((relPath) => ({
    code: "OA_PROJECT_ASSET_MISSING",
    message: `Standard project asset is missing: ${relPath}`,
    severity: "medium",
  }));

  return {
    ...inspection,
    manuscriptIndex,
    sources,
    warnings,
    checks: {
      ...inspection.checks,
      manuscript_index: true,
      source_paths_exist: true,
      standard_assets_present: assetMissing.length === 0,
      manuscript_index_matches_outline: true,
      derived_index_current: warnings.length === 0,
    },
  };
}

export async function readProjectId(projectRoot: string): Promise<string | null> {
  const rawConfig = await readYamlFile(path.join(projectRoot, "openathor.yaml"));
  await validateSchema("openathor", rawConfig, "openathor.yaml");
  return (rawConfig as ProjectConfig).project.id;
}
