import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PROTOCOL_VERSION } from "./constants.js";
import type {
  EnvelopeSource,
  EnvelopeWarning,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";
import {
  ensureSafeRelativePath,
  sha256File,
} from "./paths.js";
import {
  hashSources,
  isDirectory,
  pathExists,
} from "./project-files.js";
import { STANDARD_ASSET_FILES } from "./project-layout.js";
import { readYamlFile, validateSchema } from "./schema.js";

export type ProjectChecks = {
  openathor_yaml: boolean;
  protocol_version: boolean;
  required_directories: boolean;
  outline_chapters: boolean;
  manuscript_index: boolean;
  chapter_ids_unique: boolean;
  display_order_unique: boolean;
  source_paths_exist: boolean;
  standard_assets_present: boolean;
  manuscript_index_matches_outline: boolean;
  derived_index_current: boolean;
};

export type ProjectInspection = {
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
  sources: EnvelopeSource[];
  warnings: EnvelopeWarning[];
  checks: ProjectChecks;
};

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

export async function writeSqliteIndex(
  sqlitePath: string,
  inspection: ProjectInspection,
): Promise<void> {
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  await rm(sqlitePath, { force: true });

  const emitWarning = process.emitWarning;
  process.emitWarning = (() => undefined) as typeof process.emitWarning;
  const sqlite = await import("node:sqlite");
  process.emitWarning = emitWarning;
  const db = new sqlite.DatabaseSync(sqlitePath);

  try {
    db.exec(`
      CREATE TABLE project (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        protocol_version TEXT NOT NULL,
        source_policy TEXT NOT NULL
      );
      CREATE TABLE chapters (
        id TEXT PRIMARY KEY,
        display_order INTEGER NOT NULL,
        source_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        origin TEXT NOT NULL,
        confidence TEXT NOT NULL
      );
    `);

    db.prepare(
      "INSERT INTO project (id, title, protocol_version, source_policy) VALUES (?, ?, ?, ?)",
    ).run(
      inspection.config.project.id,
      inspection.config.project.title,
      inspection.config.protocol_version,
      inspection.config.project.source_policy,
    );

    const insertChapter = db.prepare(
      `INSERT INTO chapters
       (id, display_order, source_path, content_hash, status, origin, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const chapter of inspection.manuscriptIndex.chapters) {
      insertChapter.run(
        chapter.id,
        chapter.display_order,
        chapter.source_path,
        chapter.content_hash,
        chapter.status,
        chapter.origin,
        chapter.confidence,
      );
    }
  } finally {
    db.close();
  }
}

export async function readProjectId(projectRoot: string): Promise<string | null> {
  const rawConfig = await readYamlFile(path.join(projectRoot, "openathor.yaml"));
  await validateSchema("openathor", rawConfig, "openathor.yaml");
  return (rawConfig as ProjectConfig).project.id;
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

async function projectSources(
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

async function inspectionWarnings(
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

async function missingStandardAssets(projectRoot: string): Promise<string[]> {
  const missing = [];

  for (const relPath of STANDARD_ASSET_FILES) {
    if (!(await pathExists(path.join(projectRoot, relPath)))) {
      missing.push(relPath);
    }
  }

  return missing;
}

async function isIndexStale(
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
