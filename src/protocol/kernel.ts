import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PROTOCOL_VERSION } from "./constants.js";
import type {
  EnvelopeSource,
  EnvelopeWarning,
  EnvelopeWrite,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import {
  ensureSafeRelativePath,
  isSafeRelativePath,
  sha256File,
  toPosix,
} from "./paths.js";
import { readYamlFile, validateSchema } from "./schema.js";
import { PI_SKILL_TEXT } from "../skills/pi-skill.js";

type ProjectConfig = {
  protocol_version: string;
  project: {
    id: string;
    title: string;
    language: string;
    created_at: string;
    source_policy: "plaintext";
  };
  agent: {
    primary: "pi";
    skill: string;
    skill_version: string;
  };
  paths: {
    bible: string;
    outline: string;
    manuscript: string;
    notes: string;
    reviews: string;
    runs: string;
    manuscript_index: string;
    sqlite_index: string;
    vector_index: string;
  };
  features: {
    vector_search: "optional";
    sub_agents: "optional";
  };
};

type ChapterOutline = {
  chapters: Array<{
    id: string;
    display_order: number;
    title: string;
    status: "planned" | "drafted" | "reviewed" | "revised" | "archived";
    manuscript_path?: string;
    summary?: string;
    scenes?: string[];
    links?: Record<string, unknown>;
  }>;
};

type ChapterOutlineEntry = ChapterOutline["chapters"][number];

type ManuscriptIndex = {
  version: string;
  generated_at: string;
  source_mode: "created" | "adopted" | "standardized";
  chapters: IndexedChapter[];
  unclassified?: Array<{ path: string; reason: string }>;
  questions?: Array<{ id: string; path: string; question: string; reason?: string }>;
};

type IndexedChapter = {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
  status: "existing" | "drafted" | "revised" | "archived";
  origin: "created" | "adopted" | "standardized";
  content_hash: string;
  detected_title?: string;
  confidence: "high" | "medium" | "low";
};

type ClassifiedFile = {
  path: string;
  kind: "chapter" | "note" | "style_reference" | "scrap" | "unclassified";
  title: string;
  order: number | null;
  reason: string;
};

export type CommandResult = {
  projectRoot?: string;
  projectId?: string | null;
  sources?: EnvelopeSource[];
  writes?: EnvelopeWrite[];
  warnings?: EnvelopeWarning[];
  data?: unknown;
};

type InitOptions = {
  targetPath?: string;
  title?: string;
  language?: string;
  dryRun?: boolean;
};

type AdoptOptions = {
  targetPath?: string;
  dryRun?: boolean;
  confirmAmbiguous?: boolean;
};

type DoctorOptions = {
  cwd?: string;
  strict?: boolean;
};

type IndexRebuildOptions = {
  cwd?: string;
  dryRun?: boolean;
  vector?: boolean;
};

type ExportOptions = {
  cwd?: string;
  format?: string;
  out?: string;
  dryRun?: boolean;
};

type SkillInstallOptions = {
  cwd?: string;
  target?: "project" | "global";
  dryRun?: boolean;
};

type NotImplementedOptions = {
  command: string;
  feature: string;
  hints?: string[];
};

type StyleProfileShowOptions = {
  cwd?: string;
  maxChars?: number;
};

type StyleAnalyzeOptions = {
  cwd?: string;
  referencePath?: string;
  profileId?: string;
  name?: string;
  permission?: string;
  sourceType?: string;
  dryRun?: boolean;
};

type StyleCheckOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  maxChars?: number;
};

type AssetsAuditOptions = {
  cwd?: string;
  maxChars?: number;
};

type AssetsSyncOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  from?: string;
  confirm?: boolean;
  dryRun?: boolean;
  baseHash?: string;
};

type ContextOptions = {
  cwd?: string;
  scope?: "project" | "chapter";
  target?: string;
  maxChars?: number;
};

type OutlineShowOptions = {
  cwd?: string;
};

type OutlineImpactOptions = {
  cwd?: string;
  target?: string;
  maxChars?: number;
};

type OutlineInsertOptions = {
  cwd?: string;
  after?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

type OutlineMoveOptions = {
  cwd?: string;
  target?: string;
  after?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

type OutlineMergeOptions = {
  cwd?: string;
  target?: string;
  next?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
  nextBaseHash?: string;
};

type OutlineSplitOptions = {
  cwd?: string;
  target?: string;
  atLine?: number;
  titleBefore?: string;
  titleAfter?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
};

type OutlineReplanOptions = {
  cwd?: string;
  from?: string;
  task?: string;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
};

type OutlineArchiveOptions = {
  cwd?: string;
  target?: string;
  keepFacts?: boolean;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  baseHash?: string;
};

type WritingProposalKind = "plan" | "draft" | "review" | "revise" | "canon_sync";

type WritingProposalOptions = {
  cwd?: string;
  kind: WritingProposalKind;
  target?: string;
  task?: string;
  dryRun?: boolean;
  text?: string;
  confirmWrite?: boolean;
  baseHash?: string;
};

type SearchTextOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};

type SearchRelatedOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  limit?: number;
  maxChars?: number;
};

type SearchSemanticOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};

type VectorIndexDocument = {
  path: string;
  hash: string;
  kind: string;
  title: string | null;
  terms: string[];
  vector: number[];
  preview: string;
};

type VectorIndex = {
  schema_version: "openathor.vector_index.v1";
  generated_at: string;
  method: "deterministic_hash_embedding_v1";
  dimensions: number;
  documents: VectorIndexDocument[];
};

type CanonConflict = {
  canon_id: string | null;
  source: string;
  statement: string;
  user_request: string;
  matched_terms: string[];
};

type AssetEntity = {
  id: string | null;
  name: string;
  source_path: string;
  line: number;
  kind: "character" | "timeline_event" | "hook" | "world";
};

type AssetSyncCharacter = {
  id: string;
  name: string;
  role: string | null;
  traits: string[];
  current_state: string | null;
  notes: string[];
};

type AssetSyncTimelineEvent = {
  id: string;
  title: string;
  summary: string | null;
  notes: string[];
};

type AssetSyncHook = {
  id: string;
  title: string;
  status: string | null;
  summary: string | null;
  notes: string[];
};

type AssetSyncChapterUpdate = {
  summary: string | null;
  links: {
    characters: string[];
    timeline_events: string[];
    hooks: string[];
  };
};

type AssetSyncPackage = {
  characters: AssetSyncCharacter[];
  timeline_events: AssetSyncTimelineEvent[];
  hooks: AssetSyncHook[];
  chapter: AssetSyncChapterUpdate;
};

type AssetSyncPlan = {
  package: AssetSyncPackage;
  new_characters: AssetSyncCharacter[];
  existing_characters: AssetSyncCharacter[];
  new_timeline_events: AssetSyncTimelineEvent[];
  existing_timeline_events: AssetSyncTimelineEvent[];
  new_hooks: AssetSyncHook[];
  existing_hooks: AssetSyncHook[];
  outline_links: AssetSyncChapterUpdate["links"];
  outline_modified: boolean;
};

type StyleMetrics = {
  char_count: number;
  sentence_count: number;
  average_sentence_chars: number;
  dialogue_line_count: number;
  dialogue_ratio: number;
  paragraph_count: number;
  average_paragraph_chars: number;
  action_detail_hits: number;
  emotion_exposition_hits: number;
};

type ResolvedOutlineChapter = {
  input: string;
  outlineChapter: ChapterOutlineEntry | null;
  indexedChapter: IndexedChapter | null;
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
};

type OutlineSplitSegment = {
  title: string;
  line_start: number;
  line_end: number;
  char_count: number;
  preview: string;
  starts_with_heading: boolean;
};

type OutlineSplitPlan = {
  split_at_line: number;
  line_count: number;
  before: OutlineSplitSegment;
  after: OutlineSplitSegment;
};

type OutlineSplitParts = OutlineSplitPlan & {
  before_text: string;
  after_text: string;
};

const DEFAULT_PATHS: ProjectConfig["paths"] = {
  bible: "bible",
  outline: "outline",
  manuscript: "manuscript",
  notes: "notes",
  reviews: "reviews",
  runs: "runs",
  manuscript_index: ".openathor/manuscript.index.yaml",
  sqlite_index: ".openathor/index.sqlite",
  vector_index: ".openathor/vector",
};

const REQUIRED_DIRECTORIES = [
  "bible",
  "outline",
  "manuscript",
  "notes",
  "style",
  "reviews",
  "runs",
] as const;

const STANDARD_ASSET_DIRECTORIES = ["style", "style/samples"] as const;

const STANDARD_ASSET_FILES = [
  "bible/premise.md",
  "bible/style.md",
  "bible/world.md",
  "bible/characters.md",
  "bible/timeline.md",
  "bible/canon.md",
  "bible/canon.pending.md",
  "notes/hooks.md",
  "notes/unresolved.md",
  "notes/import-questions.md",
  "style/profiles.yaml",
  "style/references.yaml",
] as const;

const SYSTEM_DIRS = new Set([
  ".git",
  ".openathor",
  "node_modules",
  "dist",
  "coverage",
]);

export async function runInit(options: InitOptions): Promise<CommandResult> {
  const projectRoot = path.resolve(options.targetPath ?? process.cwd());
  const dryRun = options.dryRun ?? false;
  const title = options.title?.trim() || path.basename(projectRoot) || "Untitled Novel";
  const language = options.language?.trim() || "zh-CN";

  if (await pathExists(path.join(projectRoot, "openathor.yaml"))) {
    throw new OpenAthorError(
      "OA_PROJECT_ALREADY_EXISTS",
      "openathor.yaml already exists in the target directory.",
      { exitCode: 2 },
    );
  }

  if ((await pathExists(projectRoot)) && (await hasEntries(projectRoot))) {
    throw new OpenAthorError(
      "OA_INIT_TARGET_EXISTS_NONEMPTY",
      "openathor init requires an empty target directory.",
      { exitCode: 2 },
    );
  }

  const config = createProjectConfig(title, language);
  const writes = skeletonWrites("init");

  if (!dryRun) {
    await writeProjectSkeleton(projectRoot, config, {
      sourceMode: "created",
      chapters: [],
      unclassified: [],
      questions: [],
      extraWrites: writes,
    });
  }

  return {
    projectRoot,
    projectId: config.project.id,
    writes: dryRun ? [] : writes,
    data: {
      dry_run: dryRun,
      planned_writes: dryRun ? writes : [],
      title,
      language,
    },
  };
}

export async function runAdopt(options: AdoptOptions): Promise<CommandResult> {
  const projectRoot = path.resolve(options.targetPath ?? process.cwd());
  const dryRun = options.dryRun ?? false;
  const confirmAmbiguous = options.confirmAmbiguous ?? false;

  if (!(await pathExists(projectRoot))) {
    throw new OpenAthorError(
      "OA_ADOPT_UNREADABLE_PATH",
      `Cannot read adopt target ${projectRoot}.`,
      { exitCode: 2 },
    );
  }

  if (await pathExists(path.join(projectRoot, "openathor.yaml"))) {
    throw new OpenAthorError(
      "OA_PROJECT_ALREADY_EXISTS",
      "The target directory is already an OpenAthor project.",
      { exitCode: 2 },
    );
  }

  const files = await scanUserFiles(projectRoot);

  if (files.length === 0) {
    throw new OpenAthorError(
      "OA_ADOPT_NO_FILES_FOUND",
      "No readable manuscript or note files were found.",
      { exitCode: 2 },
    );
  }

  const classified = files.map(classifyFile);
  const chapters = classified.filter((file) => file.kind === "chapter");
  const notes = classified.filter((file) => file.kind === "note");
  const styleReferences = classified.filter((file) => file.kind === "style_reference");
  const scraps = classified.filter((file) => file.kind === "scrap");
  const unclassified = classified.filter((file) => file.kind === "unclassified");
  const duplicateOrders = duplicateNumericOrders(chapters);
  const hasAmbiguousOrder =
    chapters.some((chapter) => chapter.order === null) || duplicateOrders.size > 0;
  const warnings: EnvelopeWarning[] = hasAmbiguousOrder
    ? [
        {
          code: "OA_ADOPT_AMBIGUOUS_CHAPTER_ORDER",
          message: "Some chapter files need user confirmation before order is reliable.",
          severity: "high",
        },
      ]
    : [];
  const questions = buildAdoptQuestions(chapters, duplicateOrders, scraps, unclassified);
  const plannedWrites = adoptWrites();
  const data = {
    detected_chapters: chapters.map((chapter) => ({
      path: chapter.path,
      title: chapter.title,
      order: chapter.order,
      confidence:
        chapter.order === null || duplicateOrders.has(chapter.order) ? "low" : "high",
    })),
    detected_notes: notes.map((file) => ({ path: file.path, reason: file.reason })),
    detected_style_references: styleReferences.map((file) => ({
      path: file.path,
      reason: file.reason,
    })),
    unclassified: [...scraps, ...unclassified].map((file) => ({
      path: file.path,
      reason: file.reason,
    })),
    questions,
    planned_writes: plannedWrites,
    confidence_summary: {
      chapter_order: hasAmbiguousOrder ? "needs_confirmation" : "high",
      chapter_count: chapters.length,
      note_count: notes.length,
    },
  };

  if (dryRun) {
    return {
      projectRoot,
      writes: [],
      warnings,
      data: {
        dry_run: true,
        ...data,
      },
    };
  }

  if (hasAmbiguousOrder && !confirmAmbiguous) {
    throw new OpenAthorError(
      "OA_ADOPT_AMBIGUOUS_CHAPTER_ORDER",
      "Cannot adopt because chapter order is ambiguous.",
      {
        exitCode: 2,
        hints: [
          "Run openathor adopt --dry-run --json to review questions.",
          "Pass --confirm-ambiguous to write an import report with unresolved questions.",
        ],
      },
    );
  }

  const title = path.basename(projectRoot) || "Adopted Novel";
  const config = createProjectConfig(title, "zh-CN");
  const indexedChapters = await buildIndexedChapters(projectRoot, chapters, duplicateOrders);
  const outline: ChapterOutline = {
    chapters: indexedChapters.map((chapter) => ({
      id: chapter.id,
      display_order: chapter.display_order,
      title: chapter.title,
      status: "drafted",
      manuscript_path: chapter.source_path,
    })),
  };

  await writeProjectSkeleton(projectRoot, config, {
    sourceMode: "adopted",
    chapters: indexedChapters,
    unclassified: data.unclassified,
    questions,
    chapterOutline: outline,
    extraWrites: plannedWrites,
  });

  await writeAdoptSidecars(projectRoot, {
    notes,
    styleReferences,
    scraps,
    unclassified,
    questions,
    warnings,
  });

  return {
    projectRoot,
    projectId: config.project.id,
    sources: await hashSources(projectRoot, files),
    writes: plannedWrites,
    warnings,
    data: {
      dry_run: false,
      ...data,
    },
  };
}

export async function runDoctor(options: DoctorOptions = {}): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const warnings = inspection.warnings;

  if (options.strict && warnings.length > 0) {
    const first = warnings[0];
    throw new OpenAthorError(first.code, first.message, {
      exitCode: 3,
      hints: ["Run openathor index rebuild --json if the derived index is stale."],
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: [],
    warnings,
    data: {
      checks: inspection.checks,
      strict: options.strict ?? false,
    },
  };
}

export async function runIndexRebuild(
  options: IndexRebuildOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const dryRun = options.dryRun ?? false;
  const initialInspection = await inspectProject(projectRoot, { includeIndexWarning: false });
  const rebuiltManuscriptIndex = await rebuildManuscriptIndexFromOutline(
    projectRoot,
    initialInspection.chapters,
    initialInspection.manuscriptIndex,
  );
  const manuscriptIndexRel = initialInspection.config.paths.manuscript_index;
  const sqliteRel = initialInspection.config.paths.sqlite_index;
  const sqlitePath = path.join(projectRoot, sqliteRel);
  const vectorRel = path.posix.join(initialInspection.config.paths.vector_index, "index.json");
  const vectorPath = path.join(projectRoot, vectorRel);
  const writes: EnvelopeWrite[] = [
    {
      path: manuscriptIndexRel,
      change_type: (await pathExists(path.join(projectRoot, manuscriptIndexRel)))
        ? "replaced"
        : "created",
      reason: "manuscript_index_rebuild",
    },
    {
      path: sqliteRel,
      change_type: (await pathExists(sqlitePath)) ? "replaced" : "created",
      reason: "derived_index_rebuild",
    },
  ];

  if (options.vector) {
    writes.push({
      path: vectorRel,
      change_type: (await pathExists(vectorPath)) ? "replaced" : "created",
      reason: "derived_vector_index_rebuild",
    });
  }

  const inspection = await inspectionWithManuscriptIndex(
    projectRoot,
    initialInspection,
    rebuiltManuscriptIndex,
  );
  const vectorIndex = options.vector
    ? await buildVectorIndex(projectRoot, inspection)
    : null;

  if (!dryRun) {
    await writeYaml(projectRoot, manuscriptIndexRel, rebuiltManuscriptIndex);
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    await rm(sqlitePath, { force: true });
    await writeSqliteIndex(sqlitePath, inspection);

    if (vectorIndex) {
      await writeText(projectRoot, vectorRel, `${JSON.stringify(vectorIndex, null, 2)}\n`);
    }
  }

  const resultInspection = dryRun
    ? inspection
    : await inspectProject(projectRoot, { includeIndexWarning: false });

  return {
    projectRoot,
    projectId: resultInspection.config.project.id,
    sources: resultInspection.sources,
    writes: dryRun ? [] : writes,
    data: {
      dry_run: dryRun,
      planned_writes: dryRun ? writes : [],
      chapters_indexed: resultInspection.manuscriptIndex.chapters.length,
      manuscript_index: manuscriptIndexRel,
      sqlite_index: sqliteRel,
      vector_index: options.vector ? vectorRel : null,
      vector_documents_indexed: vectorIndex?.documents.length ?? 0,
    },
  };
}

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

  const chapters = inspection.manuscriptIndex.chapters
    .filter((chapter) => chapter.status !== "archived")
    .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
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
    data: {
      dry_run: dryRun,
      format,
      out_path: outPath,
      chapter_count: chapters.length,
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        source_path: chapter.source_path,
        status: chapter.status,
      })),
      char_count: totalChars,
      planned_writes: dryRun ? writes : [],
    },
  };
}

export async function runSkillInstallPi(
  options: SkillInstallOptions = {},
): Promise<CommandResult> {
  const target = options.target ?? "project";
  const dryRun = options.dryRun ?? false;
  const projectRoot =
    target === "project"
      ? await findProjectRoot(path.resolve(options.cwd ?? process.cwd()))
      : undefined;
  const skillPath =
    target === "project"
      ? path.join(projectRoot ?? "", ".pi/skills/openathor/SKILL.md")
      : path.join(osHome(), ".pi/agent/skills/openathor/SKILL.md");
  const relPath =
    target === "project"
      ? ".pi/skills/openathor/SKILL.md"
      : "~/.pi/agent/skills/openathor/SKILL.md";
  const writes: EnvelopeWrite[] = [
    {
      path: relPath,
      change_type: (await pathExists(skillPath)) ? "replaced" : "created",
      reason: "pi_skill_install",
    },
  ];

  if (!dryRun) {
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, PI_SKILL_TEXT, "utf8");
  }

  return {
    projectRoot,
    projectId: projectRoot ? (await readProjectId(projectRoot)) : null,
    writes: dryRun ? [] : writes,
    data: {
      dry_run: dryRun,
      target,
      skill_path: relPath,
      explicit_load_command:
        target === "project"
          ? "pi --skill .pi/skills/openathor/SKILL.md"
          : "pi --skill ~/.pi/agent/skills/openathor/SKILL.md",
      planned_writes: dryRun ? writes : [],
    },
  };
}

export function runNotImplemented(options: NotImplementedOptions): Promise<CommandResult> {
  return Promise.reject(
    new OpenAthorError(
      "OA_COMMAND_NOT_IMPLEMENTED",
      `${options.command} is part of the target command surface but is not implemented in this slice.`,
      {
        exitCode: 2,
        hints: [
          `${options.feature} remains a documented product capability, not a delivered CLI command yet.`,
          ...(options.hints ?? []),
        ],
      },
    ),
  );
}

export async function runStyleProfileShow(
  options: StyleProfileShowOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const maxChars = normalizeMaxChars(options.maxChars).section;
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const manualStyle = await readContextSource(
    projectRoot,
    "bible/style.md",
    maxChars,
    sourceMap,
  );
  const profiles = await readContextSource(
    projectRoot,
    "style/profiles.yaml",
    maxChars,
    sourceMap,
  );
  const references = await readContextSource(
    projectRoot,
    "style/references.yaml",
    maxChars,
    sourceMap,
  );

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      profile_source: profiles.hash ? "style/profiles.yaml" : "bible/style.md",
      manual_style: manualStyle,
      profiles,
      references,
    },
  };
}

export async function runStyleAnalyze(
  options: StyleAnalyzeOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const referencePath = normalizeStyleReferencePath(options.referencePath);
  const referenceFullPath = path.join(projectRoot, referencePath);

  if (!(await pathExists(referenceFullPath))) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_NOT_FOUND",
      `Style reference not found: ${referencePath}`,
      { exitCode: 2 },
    );
  }

  if (!isTextCandidate(referencePath)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_UNSUPPORTED",
      "Style analysis currently supports Markdown and plain text references.",
      { exitCode: 2 },
    );
  }

  const referenceText = await readFile(referenceFullPath, "utf8");
  const referenceHash = await sha256File(referenceFullPath);
  const referenceId = `ref_${shortHash(`${referencePath}:${referenceHash}`)}`;
  const profileId = normalizeStyleProfileId(
    options.profileId,
    `style_${shortHash(`${referencePath}:${referenceHash}`)}`,
  );
  const profileName = options.name?.trim() || `Style profile from ${path.posix.basename(referencePath)}`;
  const permission = normalizeStylePermission(options.permission);
  const sourceType = normalizeStyleSourceType(options.sourceType);
  const metrics = styleMetrics(referenceText);
  const profile = buildStyleProfile(profileId, profileName, referenceId, metrics);
  const reference = {
    id: referenceId,
    path: referencePath,
    source_type: sourceType,
    permission,
    allowed_use: "style_analysis",
    content_hash: referenceHash,
    profile_id: profileId,
    status: "pending",
  };
  const dryRun = options.dryRun ?? false;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_style_analyze.json`;
  const sourceMap = new Map(inspection.sources.map((source) => [source.path, source]));
  sourceMap.set(referencePath, { path: referencePath, hash: referenceHash });
  const sources = [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const writes: EnvelopeWrite[] = [
    {
      path: "style/profiles.yaml",
      change_type: "modified",
      reason: "style_analyze_pending_profile",
    },
    {
      path: "style/references.yaml",
      change_type: "modified",
      reason: "style_analyze_reference_record",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "style_analyze_run_record",
    },
  ];

  if (!dryRun) {
    await writeStyleAnalyzeFiles(projectRoot, profile, reference);
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor style analyze",
      created_at: new Date().toISOString(),
      mode: "pending_profile",
      reference,
      profile,
      metrics,
      writes,
      sources,
      user_confirmation_required: true,
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: {
      dry_run: dryRun,
      mode: "pending_profile",
      command: "openathor style analyze",
      reference,
      profile,
      metrics,
      planned_writes: dryRun ? writes : [],
      run_path: runRelPath,
      user_confirmation_required: true,
      result: {
        profile_written: !dryRun,
        profile_status: "pending",
        manuscript_modified: false,
        reference_text_copied: false,
      },
      recommendations: [
        "Review the pending style profile before using it as project guidance.",
        "Do not ask the agent to copy phrasing from the reference text.",
        "Use openathor style check chapter <target> --json after drafting or revising prose.",
      ],
    },
  };
}

export async function runStyleCheck(
  options: StyleCheckOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_STYLE_UNSUPPORTED_SCOPE",
      `Unsupported style check scope ${options.scope}.`,
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const targetChapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const styleSource = await readContextSource(
    projectRoot,
    "bible/style.md",
    Number.MAX_SAFE_INTEGER,
    sourceMap,
  );
  const profileSource = await readContextSource(
    projectRoot,
    "style/profiles.yaml",
    Number.MAX_SAFE_INTEGER,
    sourceMap,
  );
  const chapterText = await readFile(path.join(projectRoot, targetChapter.source_path), "utf8");
  sourceMap.set(targetChapter.source_path, {
    path: targetChapter.source_path,
    hash: targetChapter.content_hash,
  });
  const baselineChapters = inspection.manuscriptIndex.chapters.filter(
    (chapter) => chapter.id !== targetChapter.id && chapter.status !== "archived",
  );
  const baselineTexts = [];

  for (const chapter of baselineChapters) {
    const text = await readFile(path.join(projectRoot, chapter.source_path), "utf8");
    sourceMap.set(chapter.source_path, {
      path: chapter.source_path,
      hash: chapter.content_hash,
    });
    baselineTexts.push(text);
  }

  const targetMetrics = styleMetrics(chapterText);
  const baselineMetrics =
    baselineTexts.length > 0 ? styleMetrics(baselineTexts.join("\n\n")) : null;
  const styleRules = extractStyleRules(`${styleSource.text}\n${profileSource.text}`);
  const ruleMatches = styleRuleMatches(chapterText, styleRules, maxChars);
  const driftFindings = styleDriftFindings(targetMetrics, baselineMetrics, ruleMatches);
  const warnings = [...inspection.warnings];

  if (driftFindings.some((finding) => finding.severity === "medium")) {
    warnings.push({
      code: "OA_STYLE_DRIFT_CANDIDATE",
      message: "The target chapter has deterministic style drift candidate(s).",
      severity: "medium",
    });
  } else if (driftFindings.some((finding) => finding.severity === "low")) {
    warnings.push({
      code: "OA_STYLE_REVIEW_CANDIDATE",
      message: "The target chapter has low-severity style review candidate(s).",
      severity: "low",
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings,
    data: {
      scope: "chapter",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: targetChapter.source_path,
        content_hash: targetChapter.content_hash,
      },
      method: "deterministic_style_metric_scan",
      read_only: true,
      style_sources: {
        manual_style: {
          path: styleSource.path,
          hash: styleSource.hash,
          present: styleSource.hash !== null,
        },
        profiles: {
          path: profileSource.path,
          hash: profileSource.hash,
          present: profileSource.hash !== null,
        },
      },
      metrics: {
        target: targetMetrics,
        baseline: baselineMetrics,
      },
      rules: {
        do: styleRules.do,
        avoid: styleRules.avoid,
      },
      rule_matches: ruleMatches,
      findings: driftFindings,
      verdict:
        driftFindings.length === 0
          ? "pass"
          : driftFindings.some((finding) => finding.severity === "medium")
            ? "needs_revision"
            : "needs_review",
      recommendations: [
        "Treat deterministic style findings as review prompts, not automatic rewrite instructions.",
        "Use openathor revise chapter <target> --task ... for any confirmed revision proposal.",
        "Do not copy reference text phrasing when resolving style drift.",
      ],
    },
  };
}

export async function runAssetsAudit(
  options: AssetsAuditOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const assetFiles = await readAssetAuditSources(projectRoot, sourceMap);
  const characters = extractMarkdownEntities(
    assetFiles.characters.text,
    "bible/characters.md",
    "character",
  );
  const timelineEvents = extractMarkdownEntities(
    assetFiles.timeline.text,
    "bible/timeline.md",
    "timeline_event",
  );
  const hooks = extractMarkdownEntities(
    assetFiles.hooks.text,
    "notes/hooks.md",
    "hook",
  );
  const worldEntities = extractMarkdownEntities(
    assetFiles.world.text,
    "bible/world.md",
    "world",
  );
  const knownCharacters = assetLookup(characters);
  const knownTimelineEvents = assetLookup(timelineEvents);
  const knownHooks = assetLookup(hooks);
  const linkedAssetRefs = new Set<string>();
  const outlineLinkIssues = [];
  const chapterEntityCoverage = [];
  const summaryDrift = [];

  for (const chapter of [...inspection.chapters.chapters].sort(
    (a, b) => a.display_order - b.display_order,
  )) {
    const indexedChapter =
      inspection.manuscriptIndex.chapters.find((candidate) => candidate.id === chapter.id) ??
      null;
    const sourcePath = indexedChapter?.source_path ?? chapter.manuscript_path ?? null;
    const chapterText = sourcePath
      ? await readFile(path.join(projectRoot, sourcePath), "utf8")
      : "";
    const fullText = [chapter.title, chapter.summary ?? "", chapterText].join("\n");
    const mentionedCharacters = characters
      .filter((entity) => fullText.includes(entity.name))
      .map((entity) => entity.name);
    const linkedCharacters = stringLinks(chapter.links?.characters);
    const linkedCharacterNames = linkedCharacters.map(
      (name) => knownCharacters.get(name)?.name ?? name,
    );
    const missingCharacterLinks = mentionedCharacters.filter(
      (name) => !linkedCharacters.includes(name) && !linkedCharacterNames.includes(name),
    );

    for (const name of linkedCharacters) {
      addLinkedAssetRef(linkedAssetRefs, knownCharacters.get(name), name);
      if (!knownCharacters.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_character",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown character ${name}.`,
        });
      }
    }

    for (const name of stringLinks(chapter.links?.timeline_events)) {
      addLinkedAssetRef(linkedAssetRefs, knownTimelineEvents.get(name), name);
      if (!knownTimelineEvents.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_timeline_event",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown timeline event ${name}.`,
        });
      }
    }

    for (const name of stringLinks(chapter.links?.hooks)) {
      addLinkedAssetRef(linkedAssetRefs, knownHooks.get(name), name);
      if (!knownHooks.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_hook",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown hook ${name}.`,
        });
      }
    }

    if (mentionedCharacters.length > 0 || linkedCharacters.length > 0) {
      chapterEntityCoverage.push({
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        source_path: sourcePath,
        linked_characters: linkedCharacters,
        linked_character_names: linkedCharacterNames,
        mentioned_characters: mentionedCharacters,
        missing_character_links: missingCharacterLinks,
      });
    }

    if (chapter.summary && chapterText) {
      const summaryCoverage = summarizeAssetCoverage(chapter.summary, chapterText);

      if (
        summaryCoverage.total_terms >= 8 &&
        summaryCoverage.coverage_ratio < 0.22 &&
        summaryCoverage.segment_coverage_ratio < 0.4
      ) {
        summaryDrift.push({
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          source_path: sourcePath,
          summary_coverage_ratio: summaryCoverage.coverage_ratio,
          summary_segment_coverage_ratio: summaryCoverage.segment_coverage_ratio,
          summary_matched_terms: summaryCoverage.matched_terms.slice(0, 12),
          summary_missing_terms: summaryCoverage.missing_terms.slice(0, 12),
          summary_excerpt: snippetAround(chapter.summary, 0, 0, maxChars),
        });
      }
    }
  }

  const unlinkedCharacters = characters
    .filter(
      (entity) =>
        !linkedAssetRefs.has(entity.name) && (!entity.id || !linkedAssetRefs.has(entity.id)),
    )
    .map((entity) => ({
      name: entity.name,
      id: entity.id,
      source_path: entity.source_path,
      line: entity.line,
    }));
  const warnings = [...inspection.warnings];

  if (outlineLinkIssues.length > 0) {
    warnings.push({
      code: "OA_ASSET_LINK_UNRESOLVED",
      message: `Found ${outlineLinkIssues.length} outline link(s) that do not resolve to known longform assets.`,
      severity: "medium",
    });
  }

  const missingCoverageCount = chapterEntityCoverage.reduce(
    (count, chapter) => count + chapter.missing_character_links.length,
    0,
  );
  if (missingCoverageCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_LINK_DRIFT",
      message: `Found ${missingCoverageCount} character mention(s) in chapter context without matching outline links.`,
      severity: "low",
    });
  }

  if (summaryDrift.length > 0) {
    warnings.push({
      code: "OA_ASSET_SUMMARY_DRIFT",
      message: `Found ${summaryDrift.length} chapter summary candidate(s) whose terms are weakly represented in manuscript text.`,
      severity: "low",
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings,
    data: {
      audit: {
        version: PROTOCOL_VERSION,
        generated_at: new Date().toISOString(),
        method: "deterministic_asset_outline_text_scan",
        read_only: true,
        asset_files: Object.fromEntries(
          Object.entries(assetFiles).map(([key, value]) => [
            key,
            {
              path: value.path,
              hash: value.hash,
              present: value.hash !== null,
              char_count: value.text.length,
            },
          ]),
        ),
        assets: {
          characters,
          timeline_events: timelineEvents,
          hooks,
          world: worldEntities,
        },
        counts: {
          chapters: inspection.chapters.chapters.length,
          indexed_chapters: inspection.manuscriptIndex.chapters.length,
          characters: characters.length,
          timeline_events: timelineEvents.length,
          hooks: hooks.length,
          world_entries: worldEntities.length,
          unresolved_outline_links: outlineLinkIssues.length,
          character_link_drifts: missingCoverageCount,
          summary_drift_candidates: summaryDrift.length,
          unlinked_characters: unlinkedCharacters.length,
        },
        outline_link_issues: outlineLinkIssues,
        chapter_entity_coverage: chapterEntityCoverage,
        summary_drift: summaryDrift,
        unlinked_characters: unlinkedCharacters,
      },
      recommendations: [
        "Run this audit after Pi writes or revises longform assets.",
        "Resolve unknown outline links before relying on chapter context.",
        "When chapter text introduces recurring people, add them to bible/characters.md and outline links.",
        "Treat summary drift as a review prompt, not an automatic edit.",
      ],
    },
  };
}

export async function runAssetsSync(
  options: AssetsSyncOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_UNSUPPORTED_SCOPE",
      "openathor assets sync currently supports only chapter scope.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const targetChapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const sourcePath = targetChapter.source_path;
  const sourceHash = await sha256File(path.join(projectRoot, sourcePath));
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }
  sourceMap.set(sourcePath, { path: sourcePath, hash: sourceHash });

  const assetPackagePath = normalizeAssetSyncPackagePath(options.from);
  const assetFiles = await readAssetAuditSources(projectRoot, sourceMap);
  const syncPackage = await readAssetSyncPackage(projectRoot, assetPackagePath);
  const targetOutline =
    inspection.chapters.chapters.find((chapter) => chapter.id === targetChapter.id) ?? null;
  const plan = buildAssetSyncPlan(syncPackage, assetFiles, targetOutline);
  const confirm = options.confirm ?? false;
  const dryRun = options.dryRun ?? false;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_assets_sync.json`;
  const proposalRelPath = "bible/canon.pending.md";
  sourceMap.set(assetPackagePath, {
    path: assetPackagePath,
    hash: await sha256File(path.join(projectRoot, assetPackagePath)),
  });
  const sources = [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));

  if (confirm) {
    if (!options.baseHash) {
      throw new OpenAthorError(
        "OA_BASE_HASH_REQUIRED",
        "Confirmed asset sync writes require --base-hash <sha256:...>.",
        { exitCode: 2 },
      );
    }

    if (options.baseHash !== sourceHash) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_CHANGED",
        `Refusing to sync assets for ${targetChapter.id} because the source hash changed.`,
        {
          exitCode: 3,
          hints: [
            `Expected ${options.baseHash}.`,
            `Current ${sourceHash}.`,
            "Regenerate the asset package from the latest chapter text before confirming.",
          ],
        },
      );
    }
  }

  const writes = assetSyncWrites(confirm, plan, runRelPath, proposalRelPath);

  if (!dryRun) {
    if (confirm) {
      await writeAssetSyncConfirmed(projectRoot, inspection, targetChapter, plan);
    } else {
      await appendText(
        projectRoot,
        proposalRelPath,
        assetSyncPendingText(stamp, targetChapter, sourceHash, plan),
      );
    }

    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor assets sync",
      created_at: new Date().toISOString(),
      mode: confirm ? "confirmed_write" : "proposal",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: sourcePath,
      },
      source_hash: sourceHash,
      base_hash: options.baseHash ?? null,
      asset_package_path: assetPackagePath,
      summary: assetSyncSummary(plan),
      writes,
      sources,
      user_confirmation_required: !confirm,
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: {
      dry_run: dryRun,
      mode: confirm ? "confirmed_write" : "proposal",
      command: "openathor assets sync",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: sourcePath,
      },
      source_hash: sourceHash,
      base_hash: options.baseHash ?? null,
      asset_package_path: assetPackagePath,
      planned_writes: dryRun ? writes : [],
      run_path: runRelPath,
      proposal_path: confirm ? null : proposalRelPath,
      user_confirmation_required: !confirm,
      result: {
        characters_added: plan.new_characters.length,
        timeline_events_added: plan.new_timeline_events.length,
        hooks_added: plan.new_hooks.length,
        outline_modified: plan.outline_modified,
        confirmed_outline_written: confirm && plan.outline_modified,
        confirmed_assets_written: confirm,
      },
      sync: {
        method: "agent_structured_asset_package",
        package: plan.package,
        summary: assetSyncSummary(plan),
        outline_links: plan.outline_links,
        existing: {
          characters: plan.existing_characters.map((item) => item.id),
          timeline_events: plan.existing_timeline_events.map((item) => item.id),
          hooks: plan.existing_hooks.map((item) => item.id),
        },
        pending_note:
          "The CLI validates and merges structured asset packages; it does not infer complex story facts from prose.",
      },
      next_agent_action: confirm
        ? "Run openathor assets audit --json and refresh context before continuing the longform draft."
        : "Show this pending asset sync to the user, then rerun with --confirm --base-hash only after explicit approval.",
    },
  };
}

export async function runContext(options: ContextOptions = {}): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const scope = options.scope ?? "project";
  const maxChars = normalizeMaxChars(options.maxChars);
  const baseSources = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    baseSources.set(source.path, source);
  }

  const confirmedCanon = await readContextSource(
    projectRoot,
    "bible/canon.md",
    maxChars.section,
    baseSources,
  );
  const pendingCanon = await readContextSource(
    projectRoot,
    "bible/canon.pending.md",
    maxChars.section,
    baseSources,
  );
  const style = await readContextSource(
    projectRoot,
    "bible/style.md",
    maxChars.section,
    baseSources,
  );
  const world = await readContextSource(
    projectRoot,
    "bible/world.md",
    maxChars.section,
    baseSources,
  );
  const characters = await readContextSource(
    projectRoot,
    "bible/characters.md",
    maxChars.section,
    baseSources,
  );
  const timeline = await readContextSource(
    projectRoot,
    "bible/timeline.md",
    maxChars.section,
    baseSources,
  );
  const styleProfiles = await readContextSource(
    projectRoot,
    "style/profiles.yaml",
    maxChars.section,
    baseSources,
  );
  const styleReferences = await readContextSource(
    projectRoot,
    "style/references.yaml",
    maxChars.section,
    baseSources,
  );
  const notes = await readNotesContext(
    projectRoot,
    inspection.config.paths.notes,
    maxChars.note,
    baseSources,
  );
  const targetChapter =
    scope === "chapter"
      ? resolveContextChapter(
          options.target,
          inspection.chapters,
          inspection.manuscriptIndex,
        )
      : null;
  const nearbyChapters =
    scope === "chapter" && targetChapter
      ? contextWindow(inspection.manuscriptIndex.chapters, targetChapter.display_order)
      : [];
  const manuscript = [];

  for (const chapter of nearbyChapters) {
    manuscript.push({
      ...chapter,
      content: await readContextSource(
        projectRoot,
        chapter.source_path,
        chapter.id === targetChapter?.id ? maxChars.targetChapter : maxChars.neighborChapter,
        baseSources,
      ),
    });
  }

  const warnings = [...inspection.warnings];

  if (scope === "project" && inspection.manuscriptIndex.chapters.length === 0) {
    warnings.push({
      code: "OA_CONTEXT_EMPTY_PROJECT",
      message: "The project has no indexed chapters yet.",
      severity: "low",
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...baseSources.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings,
    data: {
      context_pack: {
        version: PROTOCOL_VERSION,
        generated_at: new Date().toISOString(),
        scope,
        target: targetChapter
          ? {
              input: options.target,
              id: targetChapter.id,
              display_order: targetChapter.display_order,
              title: targetChapter.title,
              source_path: targetChapter.source_path,
            }
          : null,
        max_chars: {
          section: maxChars.section,
          note: maxChars.note,
          target_chapter: maxChars.targetChapter,
          neighbor_chapter: maxChars.neighborChapter,
        },
        run_record: "not_written_read_only",
      },
      project: {
        id: inspection.config.project.id,
        title: inspection.config.project.title,
        language: inspection.config.project.language,
        protocol_version: inspection.config.protocol_version,
      },
      outline: {
        chapter_count: inspection.chapters.chapters.length,
        chapters: inspection.chapters.chapters,
        target: targetChapter
          ? {
              id: targetChapter.id,
              display_order: targetChapter.display_order,
              title: targetChapter.title,
            }
          : null,
      },
      canon: {
        confirmed: confirmedCanon,
        pending: pendingCanon,
        questions: inspection.manuscriptIndex.questions ?? [],
      },
      style,
      style_profiles: {
        profiles: styleProfiles,
        references: styleReferences,
      },
      assets: {
        world,
        characters,
        timeline,
      },
      notes,
      manuscript: {
        source_mode: inspection.manuscriptIndex.source_mode,
        indexed_chapters: inspection.manuscriptIndex.chapters.map((chapter) => ({
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          source_path: chapter.source_path,
          status: chapter.status,
          origin: chapter.origin,
          confidence: chapter.confidence,
          content_hash: chapter.content_hash,
        })),
        context_chapters: manuscript,
      },
    },
  };
}

export async function runOutlineShow(
  options: OutlineShowOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const indexedById = new Map(
    inspection.manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  const chapters = [...inspection.chapters.chapters]
    .sort((a, b) => a.display_order - b.display_order)
    .map((chapter) => {
      const indexedChapter = indexedById.get(chapter.id);

      return {
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        status: chapter.status,
        manuscript_path: chapter.manuscript_path ?? indexedChapter?.source_path ?? null,
        source_path: indexedChapter?.source_path ?? chapter.manuscript_path ?? null,
        content_hash: indexedChapter?.content_hash ?? null,
        confidence: indexedChapter?.confidence ?? null,
        summary: chapter.summary ?? null,
        scenes: chapter.scenes ?? [],
        links: chapter.links ?? {},
      };
    });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: [],
    warnings: inspection.warnings,
    data: {
      outline: {
        version: PROTOCOL_VERSION,
        chapter_count: chapters.length,
        active_chapter_count: chapters.filter((chapter) => chapter.status !== "archived")
          .length,
        archived_chapter_count: chapters.filter((chapter) => chapter.status === "archived")
          .length,
        chapters,
      },
    },
  };
}

export async function runOutlineImpact(
  options: OutlineImpactOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();
  addKnownSource(sourceMap, inspection.sources, "outline/chapters.yaml");
  addKnownSource(sourceMap, inspection.sources, inspection.config.paths.manuscript_index);

  const targetSource = target.source_path
    ? await readImpactSource(projectRoot, target.source_path, sourceMap)
    : null;
  const targetText = [
    target.title,
    target.outlineChapter?.summary ?? "",
    targetSource?.text ?? "",
  ].join("\n");
  const targetTerms = extractSearchTerms(targetText);
  const referenceTerms = outlineReferenceTerms(target);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const directReferences = [];
  const relatedContext = [];

  for (const relPath of relPaths) {
    if (relPath === target.source_path) {
      continue;
    }

    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const hash = await sha256File(fullPath);
    const direct = directReferenceMatch(text, referenceTerms, maxChars);

    if (direct) {
      sourceMap.set(relPath, { path: relPath, hash });
      directReferences.push({
        path: relPath,
        hash,
        matched_refs: direct.matchedRefs,
        snippet: direct.snippet,
      });
    }

    if (targetTerms.length > 0) {
      const related = relatedScore(text, targetTerms, maxChars);

      if (related.score > 0) {
        sourceMap.set(relPath, { path: relPath, hash });
        relatedContext.push({
          path: relPath,
          hash,
          score: related.score,
          shared_terms: related.sharedTerms,
          snippet: related.snippet,
        });
      }
    }
  }

  const sortedDirectReferences = directReferences.sort((a, b) =>
    a.path.localeCompare(b.path, "zh-Hans-CN"),
  );
  const sortedRelatedContext = relatedContext
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, 10);
  const followingChapters = followingOutlineChapters(
    inspection.chapters,
    inspection.manuscriptIndex,
    target.display_order,
  );
  const factCandidates = targetSource
    ? impactFactCandidates(targetSource.text, maxChars)
    : target.outlineChapter?.summary
      ? [{ line: null, text: snippetAround(target.outlineChapter.summary, 0, 0, maxChars) }]
      : [];

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      scope: "chapter",
      target: outlineTargetData(target, targetSource?.hash ?? null),
      read_only: true,
      default_action: "archive_not_delete",
      method: "deterministic_text_reference_scan",
      reference_terms: referenceTerms,
      target_terms: targetTerms.slice(0, 20),
      impact: {
        manuscript_file: {
          path: target.source_path,
          hash: targetSource?.hash ?? null,
          will_be_deleted: false,
        },
        outline_status_change: {
          from: target.outline_status,
          to: "archived",
        },
        index_status_change: {
          from: target.index_status,
          to: target.indexedChapter ? "archived" : null,
        },
        structural_links: {
          scenes: target.outlineChapter?.scenes ?? [],
          links: target.outlineChapter?.links ?? {},
        },
        fact_candidates: factCandidates,
        direct_references: sortedDirectReferences,
        related_context: sortedRelatedContext,
        following_chapters: followingChapters,
      },
      match_count: sortedDirectReferences.length + sortedRelatedContext.length,
      recommendations: [
        "Ask the user before archiving this chapter.",
        "Archive the chapter instead of deleting the manuscript file.",
        "Keep confirmed canon unchanged unless the user explicitly confirms a canon edit.",
      ],
    },
  };
}

export async function runOutlineInsert(
  options: OutlineInsertOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const after = resolveOutlineTarget(
    options.after,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const title = options.title?.trim();

  if (!title) {
    throw new OpenAthorError(
      "OA_OUTLINE_TITLE_REQUIRED",
      "openathor outline insert requires --title <title>.",
      { exitCode: 2 },
    );
  }

  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const insertOrder = after.display_order + 1;
  const chapterId = uniqueNewOutlineChapterId(
    insertOrder,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_insert.json`;
  const shiftsIndexedChapters = inspection.manuscriptIndex.chapters.some(
    (chapter) => chapter.display_order >= insertOrder,
  );
  const plannedWrites = insertWrites(runRelPath, shiftsIndexedChapters);
  const affectedChapters = insertAffectedChapters(
    inspection.chapters,
    inspection.manuscriptIndex,
    insertOrder,
  );
  const insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  } = {
    id: chapterId,
    display_order: insertOrder,
    title,
    status: "planned" as const,
    manuscript_path: null,
  };
  const data = {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline insert",
    after: outlineTargetData(after, null),
    inserted: insertedChapter,
    result: insertResult(insertedChapter, affectedChapters, false),
    user_confirmation_required: !confirm,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: insertDiff(after, insertedChapter, affectedChapters),
    next_agent_action: previewOnly
      ? "Show the planned structural change to the user and rerun with --confirm only after explicit approval."
      : "Run openathor outline show --json and refresh context before drafting the inserted chapter.",
  };

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: insertSources(inspection.sources),
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  const updatedChapters: ChapterOutline = {
    chapters: [
      ...inspection.chapters.chapters.map((chapter) =>
        chapter.display_order >= insertOrder
          ? {
              ...chapter,
              display_order: chapter.display_order + 1,
            }
          : chapter,
      ),
      {
        id: chapterId,
        display_order: insertOrder,
        title,
        status: "planned" as const,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);

  if (shiftsIndexedChapters) {
    const updatedIndex: ManuscriptIndex = {
      ...inspection.manuscriptIndex,
      generated_at: new Date().toISOString(),
      chapters: inspection.manuscriptIndex.chapters
        .map((chapter) =>
          chapter.display_order >= insertOrder
            ? {
                ...chapter,
                display_order: chapter.display_order + 1,
              }
            : chapter,
        )
        .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
    };

    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  }
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline insert",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    after: outlineTargetData(after, null),
    inserted: insertedChapter,
    affected_chapters: affectedChapters,
    manuscript_file_created: false,
    writes: plannedWrites,
    sources: insertSources(inspection.sources),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: insertSources(inspection.sources),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...data,
      planned_writes: [],
      result: insertResult(insertedChapter, affectedChapters, true),
    },
  };
}

export async function runOutlineMove(
  options: OutlineMoveOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const after = resolveOutlineTarget(
    options.after,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (target.id === after.id) {
    throw new OpenAthorError(
      "OA_OUTLINE_MOVE_INVALID",
      "Cannot move a chapter after itself.",
      { exitCode: 2 },
    );
  }

  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const movedChapters = moveDisplayOrderChanges(inspection.chapters, target.id, after.id);
  const noOp = movedChapters.length === 0;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_move.json`;
  const plannedWrites = moveWrites(runRelPath, movedChapters);
  const data = {
    dry_run: dryRun,
    mode: noOp ? "no_op" : previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline move",
    target: outlineTargetData(target, null),
    after: outlineTargetData(after, null),
    result: moveResult(target, after, movedChapters, false),
    user_confirmation_required: noOp ? false : !confirm,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: moveDiff(target, after, movedChapters),
    next_agent_action: noOp
      ? "No order change is needed."
      : previewOnly
        ? "Show the planned order change to the user and rerun with --confirm only after explicit approval."
        : "Run openathor outline show --json and refresh context before follow-up writing.",
  };

  if (noOp || previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: moveSources(inspection.sources),
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  const displayOrderById = new Map(
    movedChapters.map((chapter) => [chapter.id, chapter.to_display_order]),
  );
  const updatedChapters: ChapterOutline = {
    chapters: inspection.chapters.chapters
      .map((chapter) => ({
        ...chapter,
        display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
      }))
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: inspection.manuscriptIndex.chapters
      .map((chapter) => ({
        ...chapter,
        display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
      }))
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline move",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, null),
    after: outlineTargetData(after, null),
    moved_chapters: movedChapters,
    manuscript_files_moved: false,
    writes: plannedWrites,
    sources: moveSources(inspection.sources),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: moveSources(inspection.sources),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...data,
      planned_writes: [],
      result: moveResult(target, after, movedChapters, true),
    },
  };
}

export async function runOutlineMerge(
  options: OutlineMergeOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const next = resolveOutlineTarget(
    options.next,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (target.id === next.id) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_INVALID",
      "Cannot merge a chapter with itself.",
      { exitCode: 2 },
    );
  }

  if (next.display_order !== target.display_order + 1) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_INVALID",
      "openathor outline merge currently requires adjacent chapters.",
      {
        exitCode: 2,
        hints: ["Use openathor outline move first if the chapters are not adjacent."],
      },
    );
  }

  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();
  addKnownSource(sourceMap, inspection.sources, "outline/chapters.yaml");
  addKnownSource(sourceMap, inspection.sources, inspection.config.paths.manuscript_index);
  const targetSource = target.source_path
    ? await readImpactSource(projectRoot, target.source_path, sourceMap)
    : null;
  const nextSource = next.source_path
    ? await readImpactSource(projectRoot, next.source_path, sourceMap)
    : null;
  const mergedTitle = options.title?.trim() || `${target.title} / ${next.title}`;
  const plan = mergePlan(target, next, mergedTitle, targetSource?.text, nextSource?.text, maxChars);
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_merge.json`;
  const plannedWrites = mergeWrites(target, next, runRelPath);

  if (confirm) {
    if (!target.source_path || !targetSource) {
      throw new OpenAthorError(
        "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
        `Cannot merge into ${target.id} because it has no manuscript source file.`,
        { exitCode: 2 },
      );
    }

    if (!next.source_path || !nextSource) {
      throw new OpenAthorError(
        "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
        `Cannot merge ${next.id} because it has no manuscript source file.`,
        { exitCode: 2 },
      );
    }

    if (!options.baseHash || !options.nextBaseHash) {
      throw new OpenAthorError(
        "OA_BASE_HASH_REQUIRED",
        "Confirmed merge writes require --base-hash <sha256:...> and --next-base-hash <sha256:...>.",
        { exitCode: 2 },
      );
    }

    if (options.baseHash !== targetSource.hash) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_CHANGED",
        `Refusing to merge ${target.id} because the target source hash changed.`,
        {
          exitCode: 3,
          hints: [
            `Expected ${options.baseHash}.`,
            `Current ${targetSource.hash}.`,
            "Run openathor outline merge again before confirming the merge.",
          ],
        },
      );
    }

    if (options.nextBaseHash !== nextSource.hash) {
      throw new OpenAthorError(
        "OA_MANUSCRIPT_CHANGED",
        `Refusing to merge ${next.id} because the next source hash changed.`,
        {
          exitCode: 3,
          hints: [
            `Expected ${options.nextBaseHash}.`,
            `Current ${nextSource.hash}.`,
            "Run openathor outline merge again before confirming the merge.",
          ],
        },
      );
    }
  }

  const mergeData = mergeProposalData(
    target,
    next,
    targetSource?.hash ?? null,
    nextSource?.hash ?? null,
    plan,
    dryRun,
    diff,
    previewOnly,
    plannedWrites,
  );

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
      writes: [],
      warnings: inspection.warnings,
      data: mergeData,
    };
  }

  const targetSourcePath = target.source_path;
  const nextSourcePath = next.source_path;

  if (!targetSourcePath || !nextSourcePath || !targetSource || !nextSource) {
    throw new OpenAthorError(
      "OA_OUTLINE_MERGE_SOURCE_REQUIRED",
      "Confirmed merge writes require both chapters to have manuscript source files.",
      { exitCode: 2 },
    );
  }

  const mergedText = ensureTrailingNewline(
    mergedChapterText(mergedTitle, targetSource.text, nextSource.text),
  );
  await writeText(projectRoot, targetSourcePath, mergedText);
  const mergedHash = await sha256File(path.join(projectRoot, targetSourcePath));
  const updatedChapters: ChapterOutline = {
    chapters: inspection.chapters.chapters.map((chapter) => {
      if (chapter.id === target.id) {
        return {
          ...chapter,
          title: mergedTitle,
          status: "revised" as const,
          manuscript_path: targetSourcePath,
          summary: mergedSummary(chapter.summary, next.outlineChapter?.summary),
          links: mergeOutlineLinks(chapter.links, next.outlineChapter?.links),
        };
      }

      if (chapter.id === next.id) {
        return {
          ...chapter,
          status: "archived" as const,
          manuscript_path: chapter.manuscript_path ?? nextSourcePath,
        };
      }

      return chapter;
    }),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: inspection.manuscriptIndex.chapters.map((chapter) => {
      if (chapter.id === target.id) {
        return {
          ...chapter,
          title: mergedTitle,
          status: "revised" as const,
          content_hash: mergedHash,
          detected_title: mergedTitle,
        };
      }

      if (chapter.id === next.id) {
        return {
          ...chapter,
          status: "archived" as const,
          content_hash: nextSource?.hash ?? chapter.content_hash,
        };
      }

      return chapter;
    }),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline merge",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, targetSource?.hash ?? null),
    next: outlineTargetData(next, nextSource?.hash ?? null),
    merged: {
      ...plan,
      content_hash: mergedHash,
    },
    base_hash: options.baseHash,
    next_base_hash: options.nextBaseHash,
    writes: plannedWrites,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...mergeData,
      mode: "confirmed_write",
      result: {
        applied: true,
        manuscript_file_modified: true,
        manuscript_files_deleted: false,
        outline_modified: true,
        index_modified: true,
        archived_chapter_id: next.id,
        target_content_hash: mergedHash,
      },
      user_confirmation_required: false,
      confirmed_write_supported: true,
      planned_writes: [],
      run_path: runRelPath,
      next_agent_action:
        "Run openathor outline show --json and refresh context before follow-up writing.",
    },
  };
}

export async function runOutlineSplit(
  options: OutlineSplitOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );

  if (!target.source_path) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_SOURCE_REQUIRED",
      `Cannot split ${target.id} because it has no manuscript source file.`,
      {
        exitCode: 2,
        hints: ["Use openathor outline show --json to inspect chapter source paths."],
      },
    );
  }

  const titleBefore = options.titleBefore?.trim();
  const titleAfter = options.titleAfter?.trim();

  if (!titleBefore || !titleAfter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TITLE_REQUIRED",
      "openathor outline split requires --title-before <title> and --title-after <title>.",
      { exitCode: 2 },
    );
  }

  const splitAtLine = normalizeSplitLine(options.atLine);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const targetSource = await readImpactSource(projectRoot, target.source_path);
  const splitPlan = outlineSplitParts(
    targetSource.text,
    splitAtLine,
    titleBefore,
    titleAfter,
    maxChars,
  );
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const insertedOrder = target.display_order + 1;
  const insertedId = uniqueNewOutlineChapterId(
    insertedOrder,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const insertedSourcePath = splitSourcePath(target.source_path, insertedOrder, insertedId);
  const fullInsertedPath = path.join(projectRoot, insertedSourcePath);
  const shiftsIndexedChapters = inspection.manuscriptIndex.chapters.some(
    (chapter) => chapter.display_order >= insertedOrder && chapter.id !== target.id,
  );
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_split.json`;
  const plannedWrites = splitWrites(
    target,
    insertedSourcePath,
    runRelPath,
    shiftsIndexedChapters,
  );
  const splitData = splitProposalData(
    target,
    targetSource.hash,
    splitPlan,
    insertedId,
    insertedSourcePath,
    dryRun,
    diff,
    previewOnly,
    plannedWrites,
  );

  if (options.baseHash && options.baseHash !== targetSource.hash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to split ${target.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${targetSource.hash}.`,
          "Run openathor outline split again before confirming the split.",
        ],
      },
    );
  }

  if (confirm && !options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed split writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  if (!previewOnly && (await pathExists(fullInsertedPath))) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_TARGET_EXISTS",
      `Refusing to overwrite existing manuscript file ${insertedSourcePath}.`,
      { exitCode: 3 },
    );
  }

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
      writes: [],
      warnings: inspection.warnings,
      data: splitData,
    };
  }

  const beforeText = ensureTrailingNewline(splitPlan.before_text);
  const afterText = ensureTrailingNewline(splitPlan.after_text);
  await writeText(projectRoot, target.source_path, beforeText);
  await writeText(projectRoot, insertedSourcePath, afterText);
  const beforeHash = await sha256File(path.join(projectRoot, target.source_path));
  const afterHash = await sha256File(fullInsertedPath);
  const displayOrderById = splitDisplayOrderById(
    inspection.chapters,
    insertedOrder,
    target.id,
  );
  const updatedChapters: ChapterOutline = {
    chapters: [
      ...inspection.chapters.chapters.map((chapter) => {
        if (chapter.id === target.id) {
          return {
            ...chapter,
            title: splitPlan.before.title,
            status: "revised" as const,
            manuscript_path: target.source_path ?? undefined,
          };
        }

        return {
          ...chapter,
          display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
        };
      }),
      {
        id: insertedId,
        display_order: insertedOrder,
        title: splitPlan.after.title,
        status: "drafted" as const,
        manuscript_path: insertedSourcePath,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: [
      ...inspection.manuscriptIndex.chapters.map((chapter) => {
        if (chapter.id === target.id) {
          return {
            ...chapter,
            title: splitPlan.before.title,
            status: "revised" as const,
            content_hash: beforeHash,
            detected_title: splitPlan.before.title,
          };
        }

        return {
          ...chapter,
          display_order: displayOrderById.get(chapter.id) ?? chapter.display_order,
        };
      }),
      {
        id: insertedId,
        display_order: insertedOrder,
        title: splitPlan.after.title,
        source_path: insertedSourcePath,
        status: "drafted" as const,
        origin: "created" as const,
        content_hash: afterHash,
        detected_title: splitPlan.after.title,
        confidence: "high" as const,
      },
    ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline split",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, targetSource.hash),
    inserted: {
      id: insertedId,
      display_order: insertedOrder,
      title: splitPlan.after.title,
      source_path: insertedSourcePath,
      content_hash: afterHash,
    },
    split_at_line: splitPlan.split_at_line,
    base_hash: options.baseHash,
    writes: plannedWrites,
    sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: splitSources(inspection.sources, target.source_path, targetSource.hash),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...splitData,
      mode: "confirmed_write",
      planned_writes: [],
      confirmed_write_supported: true,
      run_path: runRelPath,
      result: splitResult(splitPlan, true),
      next_agent_action:
        "Run openathor outline show --json and refresh context before follow-up writing.",
    },
  };
}

export async function runOutlineReplan(
  options: OutlineReplanOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const from = resolveOutlineTarget(
    options.from,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const task = options.task?.trim();

  if (!task) {
    throw new OpenAthorError(
      "OA_TASK_REQUIRED",
      "openathor outline replan requires --task <text>.",
      { exitCode: 2 },
    );
  }

  const maxChars = normalizeSnippetChars(options.maxChars);
  const indexedById = new Map(
    inspection.manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );
  const affected = inspection.chapters.chapters
    .filter((chapter) => chapter.display_order >= from.display_order)
    .sort((a, b) => a.display_order - b.display_order)
    .map((chapter) => {
      const indexedChapter = indexedById.get(chapter.id);
      return {
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        status: chapter.status,
        source_path: indexedChapter?.source_path ?? chapter.manuscript_path ?? null,
        summary: chapter.summary
          ? snippetAround(chapter.summary.replace(/\s+/g, " "), 0, 0, maxChars)
          : null,
      };
    });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: replanSources(inspection.sources),
    writes: [],
    warnings: inspection.warnings,
    data: {
      dry_run: options.dryRun ?? false,
      mode: options.diff ? "diff" : "proposal",
      command: "openathor outline replan",
      task,
      from: outlineTargetData(from, null),
      affected_chapters: affected,
      result: {
        applied: false,
        outline_modified: false,
        index_modified: false,
        manuscript_files_modified: false,
      },
      user_confirmation_required: true,
      confirmed_write_supported: false,
      planned_writes: replanWrites(affected),
      diff: replanDiff(from, affected),
      next_agent_action:
        "Use this proposal as a planning boundary. Confirmed replan writes are not implemented yet; create plan/revise proposals instead of editing outline metadata directly.",
    },
  };
}

export async function runOutlineArchive(
  options: OutlineArchiveOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const target = resolveOutlineTarget(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const keepFacts = options.keepFacts ?? true;
  const targetSource = target.source_path
    ? await readImpactSource(projectRoot, target.source_path)
    : null;

  if (options.baseHash && targetSource && options.baseHash !== targetSource.hash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to archive ${target.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${targetSource.hash}.`,
          "Run openathor outline impact again before confirming archive.",
        ],
      },
    );
  }

  const alreadyArchived =
    target.outline_status === "archived" &&
    (!target.indexedChapter || target.index_status === "archived");
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_archive.json`;
  const plannedWrites = archiveWrites(target, alreadyArchived, runRelPath);
  const data = {
    dry_run: dryRun,
    mode: alreadyArchived
      ? "no_op"
      : previewOnly
        ? diff
          ? "diff"
          : "proposal"
        : "confirmed_write",
    command: "openathor outline archive",
    target: outlineTargetData(target, targetSource?.hash ?? null),
    keep_facts: keepFacts,
    manuscript_file_deleted: false,
    result: archiveResult(target, false),
    user_confirmation_required: !confirm,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: archiveDiff(target),
    next_agent_action: alreadyArchived
      ? "The chapter is already archived."
      : previewOnly
        ? "Show impact to the user and rerun with --confirm only after explicit approval."
        : "Refresh context before making follow-up writing or canon proposals.",
  };

  if (alreadyArchived || previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources: archiveSources(inspection.sources, target.source_path),
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  const updatedChapters: ChapterOutline = {
    chapters: inspection.chapters.chapters.map((chapter) =>
      chapter.id === target.id
        ? {
            ...chapter,
            status: "archived",
            manuscript_path: chapter.manuscript_path ?? target.source_path ?? undefined,
          }
        : chapter,
    ),
  };
  const updatedIndex: ManuscriptIndex = {
    ...inspection.manuscriptIndex,
    generated_at: new Date().toISOString(),
    chapters: inspection.manuscriptIndex.chapters.map((chapter) =>
      chapter.id === target.id
        ? {
            ...chapter,
            status: "archived",
            content_hash: targetSource?.hash ?? chapter.content_hash,
          }
        : chapter,
    ),
  };

  await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);

  if (target.indexedChapter) {
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
  }

  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor outline archive",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    target: outlineTargetData(target, targetSource?.hash ?? null),
    keep_facts: keepFacts,
    manuscript_file_deleted: false,
    writes: plannedWrites,
    sources: archiveSources(inspection.sources, target.source_path),
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: archiveSources(inspection.sources, target.source_path),
    writes: plannedWrites,
    warnings: inspection.warnings,
    data: {
      ...data,
      planned_writes: [],
      result: archiveResult(target, true),
    },
  };
}

function resolveOutlineTarget(
  target: string | undefined,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): ResolvedOutlineChapter {
  if (!target) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_REQUIRED",
      "openathor outline requires a chapter id or display order.",
      { exitCode: 2 },
    );
  }

  const outlineChapter =
    chapters.chapters.find(
      (chapter) => chapter.id === target || String(chapter.display_order) === target,
    ) ?? null;
  const indexedChapter =
    manuscriptIndex.chapters.find(
      (chapter) =>
        chapter.id === target ||
        String(chapter.display_order) === target ||
        chapter.id === outlineChapter?.id,
    ) ?? null;

  if (!outlineChapter && !indexedChapter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${target}.`,
      {
        exitCode: 2,
        hints: ["Use openathor outline show --json to inspect chapter ids."],
      },
    );
  }

  const id = outlineChapter?.id ?? indexedChapter?.id ?? target;
  const displayOrder =
    outlineChapter?.display_order ?? indexedChapter?.display_order ?? Number(target);
  const title = outlineChapter?.title ?? indexedChapter?.title ?? id;
  const sourcePath =
    indexedChapter?.source_path ?? outlineChapter?.manuscript_path ?? null;

  return {
    input: target,
    outlineChapter,
    indexedChapter,
    id,
    display_order: displayOrder,
    title,
    source_path: sourcePath,
    outline_status: outlineChapter?.status ?? null,
    index_status: indexedChapter?.status ?? null,
  };
}

async function readImpactSource(
  projectRoot: string,
  relPath: string,
  sources?: Map<string, EnvelopeSource>,
): Promise<{
  path: string;
  hash: string;
  text: string;
}> {
  const fullPath = path.join(projectRoot, relPath);
  const hash = await sha256File(fullPath);
  const text = await readFile(fullPath, "utf8");
  sources?.set(relPath, { path: relPath, hash });

  return {
    path: relPath,
    hash,
    text,
  };
}

function addKnownSource(
  sourceMap: Map<string, EnvelopeSource>,
  sources: EnvelopeSource[],
  relPath: string,
): void {
  const source = sources.find((candidate) => candidate.path === relPath);

  if (source) {
    sourceMap.set(relPath, source);
  }
}

function outlineReferenceTerms(target: ResolvedOutlineChapter): string[] {
  const terms = new Set<string>();

  for (const value of [
    target.id,
    target.title,
    target.source_path ?? "",
    target.source_path ? path.posix.basename(target.source_path) : "",
    `chapter ${target.display_order}`,
    `display_order: ${target.display_order}`,
    `第${target.display_order}章`,
    `第 ${target.display_order} 章`,
  ]) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      terms.add(trimmed);
    }
  }

  return [...terms];
}

function directReferenceMatch(
  text: string,
  referenceTerms: string[],
  maxChars: number,
): {
  matchedRefs: string[];
  snippet: string;
} | null {
  const normalized = text.toLowerCase();
  const matchedRefs = referenceTerms.filter((term) =>
    normalized.includes(term.toLowerCase()),
  );

  if (matchedRefs.length === 0) {
    return null;
  }

  const compactText = text.replace(/\s+/g, " ");
  const compactNormalized = compactText.toLowerCase();
  const firstRef = matchedRefs[0];
  const index = Math.max(0, compactNormalized.indexOf(firstRef.toLowerCase()));

  return {
    matchedRefs,
    snippet: snippetAround(compactText, index, firstRef.length, maxChars),
  };
}

function followingOutlineChapters(
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
  displayOrder: number,
): Array<{
  id: string;
  display_order: number;
  title: string;
  status: ChapterOutlineEntry["status"];
  source_path: string | null;
}> {
  const indexedById = new Map(
    manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  return chapters.chapters
    .filter(
      (chapter) => chapter.display_order > displayOrder && chapter.status !== "archived",
    )
    .sort((a, b) => a.display_order - b.display_order)
    .slice(0, 5)
    .map((chapter) => ({
      id: chapter.id,
      display_order: chapter.display_order,
      title: chapter.title,
      status: chapter.status,
      source_path: indexedById.get(chapter.id)?.source_path ?? chapter.manuscript_path ?? null,
    }));
}

function impactFactCandidates(
  text: string,
  maxChars: number,
): Array<{
  line: number | null;
  text: string;
}> {
  const lines = text.split(/\r?\n/);
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || line.length < 4) {
      continue;
    }

    if (
      line.startsWith("#") ||
      /设定|真相|伏笔|线索|承诺|约定|人物|状态|道具|地点|时间|fact|canon|clue|hook/i.test(
        line,
      )
    ) {
      candidates.push({
        line: index + 1,
        text: snippetAround(line, 0, 0, maxChars),
      });
    }

    if (candidates.length >= 8) {
      break;
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  return lines
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((line) => line.text.length >= 4)
    .slice(0, 5)
    .map((line) => ({
      line: line.line,
      text: snippetAround(line.text, 0, 0, maxChars),
    }));
}

function outlineTargetData(
  target: ResolvedOutlineChapter,
  sourceHash: string | null,
): {
  input: string;
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  source_hash: string | null;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
} {
  return {
    input: target.input,
    id: target.id,
    display_order: target.display_order,
    title: target.title,
    source_path: target.source_path,
    source_hash: sourceHash,
    outline_status: target.outline_status,
    index_status: target.index_status,
  };
}

function insertResult(
  insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  },
  affectedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
  applied: boolean,
): {
  applied: boolean;
  inserted_chapter: typeof insertedChapter;
  affected_chapters: typeof affectedChapters;
  manuscript_file_created: false;
  manuscript_files_moved: false;
} {
  return {
    applied,
    inserted_chapter: insertedChapter,
    affected_chapters: affectedChapters,
    manuscript_file_created: false,
    manuscript_files_moved: false,
  };
}

function insertAffectedChapters(
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
  insertOrder: number,
): Array<{
  id: string;
  title: string;
  from_display_order: number;
  to_display_order: number;
  source_path: string | null;
}> {
  const indexedById = new Map(
    manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  return chapters.chapters
    .filter((chapter) => chapter.display_order >= insertOrder)
    .sort((a, b) => a.display_order - b.display_order)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      from_display_order: chapter.display_order,
      to_display_order: chapter.display_order + 1,
      source_path: indexedById.get(chapter.id)?.source_path ?? chapter.manuscript_path ?? null,
    }));
}

function insertWrites(runRelPath: string, shiftsIndexedChapters: boolean): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_insert_planned_chapter",
    },
  ];

  if (shiftsIndexedChapters) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_insert_display_order_shift",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_insert_run_record",
  });

  return writes;
}

function insertDiff(
  after: ResolvedOutlineChapter,
  insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  },
  affectedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Insert a planned chapter in outline metadata; keep existing chapter ids and manuscript files in place.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${after.id}]`,
        from: null,
        to: insertedChapter.id,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${insertedChapter.id}].display_order`,
        from: null,
        to: insertedChapter.display_order,
      },
      ...affectedChapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].display_order`,
        from: chapter.from_display_order,
        to: chapter.to_display_order,
      })),
      ...affectedChapters
        .filter((chapter) => chapter.source_path)
        .map((chapter) => ({
          path: ".openathor/manuscript.index.yaml",
          field: `chapters[${chapter.id}].display_order`,
          from: chapter.from_display_order,
          to: chapter.to_display_order,
        })),
    ],
  };
}

function insertSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function moveDisplayOrderChanges(
  chapters: ChapterOutline,
  targetId: string,
  afterId: string,
): Array<{
  id: string;
  title: string;
  from_display_order: number;
  to_display_order: number;
  status: ChapterOutlineEntry["status"];
  source_path: string | null;
}> {
  const ordered = [...chapters.chapters].sort(
    (a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id),
  );
  const targetIndex = ordered.findIndex((chapter) => chapter.id === targetId);
  const targetChapter = ordered[targetIndex];

  if (!targetChapter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${targetId}.`,
      { exitCode: 2 },
    );
  }

  ordered.splice(targetIndex, 1);
  const afterIndex = ordered.findIndex((chapter) => chapter.id === afterId);

  if (afterIndex < 0) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${afterId}.`,
      { exitCode: 2 },
    );
  }

  ordered.splice(afterIndex + 1, 0, targetChapter);

  return ordered
    .map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      from_display_order: chapter.display_order,
      to_display_order: index + 1,
      status: chapter.status,
      source_path: chapter.manuscript_path ?? null,
    }))
    .filter((chapter) => chapter.from_display_order !== chapter.to_display_order);
}

function moveResult(
  target: ResolvedOutlineChapter,
  after: ResolvedOutlineChapter,
  movedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    status: ChapterOutlineEntry["status"];
    source_path: string | null;
  }>,
  applied: boolean,
): {
  applied: boolean;
  target: { id: string; from_display_order: number; to_display_order: number | null };
  after: { id: string; display_order: number };
  moved_chapters: typeof movedChapters;
  manuscript_files_moved: false;
} {
  const movedTarget = movedChapters.find((chapter) => chapter.id === target.id);

  return {
    applied,
    target: {
      id: target.id,
      from_display_order: target.display_order,
      to_display_order: movedTarget?.to_display_order ?? target.display_order,
    },
    after: {
      id: after.id,
      display_order: after.display_order,
    },
    moved_chapters: movedChapters,
    manuscript_files_moved: false,
  };
}

function moveWrites(
  runRelPath: string,
  movedChapters: Array<{ source_path: string | null }>,
): EnvelopeWrite[] {
  if (movedChapters.length === 0) {
    return [];
  }

  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_move_display_order",
    },
  ];

  if (movedChapters.some((chapter) => chapter.source_path)) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_move_index_display_order",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_move_run_record",
  });

  return writes;
}

function moveDiff(
  target: ResolvedOutlineChapter,
  after: ResolvedOutlineChapter,
  movedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Move chapter display order in outline metadata; keep chapter ids and manuscript files in place.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `move[${target.id}].after`,
        from: target.display_order,
        to: after.id,
      },
      ...movedChapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].display_order`,
        from: chapter.from_display_order,
        to: chapter.to_display_order,
      })),
      ...movedChapters
        .filter((chapter) => chapter.source_path)
        .map((chapter) => ({
          path: ".openathor/manuscript.index.yaml",
          field: `chapters[${chapter.id}].display_order`,
          from: chapter.from_display_order,
          to: chapter.to_display_order,
        })),
    ],
  };
}

function moveSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function mergePlan(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  title: string,
  targetText: string | undefined,
  nextText: string | undefined,
  maxChars: number,
): {
  title: string;
  kept_chapter_id: string;
  archived_chapter_id: string;
  display_order: number;
  source_paths: string[];
  preview: string;
} {
  const preview = [targetText ?? target.title, nextText ?? next.title]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  return {
    title,
    kept_chapter_id: target.id,
    archived_chapter_id: next.id,
    display_order: target.display_order,
    source_paths: [target.source_path, next.source_path].filter(
      (value): value is string => Boolean(value),
    ),
    preview: snippetAround(preview, 0, 0, maxChars),
  };
}

function mergeProposalData(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  targetHash: string | null,
  nextHash: string | null,
  plan: ReturnType<typeof mergePlan>,
  dryRun: boolean,
  diff: boolean,
  previewOnly: boolean,
  plannedWrites: EnvelopeWrite[],
): {
  dry_run: boolean;
  mode: "proposal" | "diff" | "confirmed_write";
  command: "openathor outline merge";
  target: ReturnType<typeof outlineTargetData>;
  next: ReturnType<typeof outlineTargetData>;
  merged: ReturnType<typeof mergePlan>;
  result: {
    applied: boolean;
    manuscript_file_modified: boolean;
    manuscript_files_deleted: false;
    outline_modified: boolean;
    index_modified: boolean;
  };
  user_confirmation_required: boolean;
  confirmed_write_supported: boolean;
  planned_writes: EnvelopeWrite[];
  diff: ReturnType<typeof mergeDiff>;
  next_agent_action: string;
} {
  return {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline merge",
    target: outlineTargetData(target, targetHash),
    next: outlineTargetData(next, nextHash),
    merged: plan,
    result: {
      applied: false,
      manuscript_file_modified: false,
      manuscript_files_deleted: false,
      outline_modified: false,
      index_modified: false,
    },
    user_confirmation_required: previewOnly,
    confirmed_write_supported: true,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: mergeDiff(target, next, plan, previewOnly),
    next_agent_action: previewOnly
      ? "Show the merge proposal to the user and rerun with --confirm plus both source hashes after explicit approval."
      : "Run openathor outline show --json and refresh context before follow-up writing.",
  };
}

function mergeWrites(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  runRelPath: string,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_merge_metadata",
    },
  ];

  if (target.indexedChapter || next.indexedChapter) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_merge_index",
    });
  }

  if (target.source_path) {
    writes.push({
      path: target.source_path,
      change_type: "modified",
      reason: "outline_merge_manuscript_source",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_merge_run_record",
  });

  return writes;
}

function mergeDiff(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  plan: ReturnType<typeof mergePlan>,
  previewOnly = true,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary: previewOnly
      ? "Preview: merge adjacent chapters into one kept chapter; no files are changed."
      : "Confirmed: merge adjacent chapters into one kept chapter and archive the next chapter.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `chapters[${target.id}].title`,
        from: target.title,
        to: plan.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${next.id}].status`,
        from: next.outline_status,
        to: "archived",
      },
      {
        path: ".openathor/manuscript.index.yaml",
        field: `chapters[${next.id}].status`,
        from: next.index_status,
        to: "archived",
      },
    ],
  };
}

function mergedChapterText(title: string, targetText: string, nextText: string): string {
  const targetBody = stripMarkdownHeading(targetText).trim();
  const nextBody = stripMarkdownHeading(nextText).trim();

  return [
    `# ${title}`,
    "",
    targetBody,
    "",
    "<!-- merged-from-next-chapter -->",
    "",
    nextBody,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function stripMarkdownHeading(text: string): string {
  return text.replace(/^#\s+.+(?:\r?\n|$)/u, "");
}

function mergedSummary(
  targetSummary: string | undefined,
  nextSummary: string | undefined,
): string | undefined {
  const parts = [targetSummary, nextSummary]
    .map((summary) => summary?.trim())
    .filter((summary): summary is string => Boolean(summary));

  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function mergeOutlineLinks(
  targetLinks: Record<string, unknown> | undefined,
  nextLinks: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!targetLinks && !nextLinks) {
    return undefined;
  }

  const merged: Record<string, unknown> = { ...(targetLinks ?? {}) };

  for (const [key, value] of Object.entries(nextLinks ?? {})) {
    const current = merged[key];

    if (Array.isArray(current) || Array.isArray(value)) {
      merged[key] = uniqueUnknownArray([
        ...(Array.isArray(current) ? current : current === undefined ? [] : [current]),
        ...(Array.isArray(value) ? value : value === undefined ? [] : [value]),
      ]);
      continue;
    }

    if (current === undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

function uniqueUnknownArray(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result = [];

  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeSplitLine(atLine: number | undefined): number {
  if (atLine === undefined) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_LINE_REQUIRED",
      "openathor outline split requires --at-line <line>.",
      { exitCode: 2 },
    );
  }

  if (!Number.isFinite(atLine) || !Number.isInteger(atLine) || atLine < 2) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      "--at-line must be an integer line number greater than 1.",
      { exitCode: 2 },
    );
  }

  return atLine;
}

function outlineSplitParts(
  text: string,
  splitAtLine: number,
  titleBefore: string,
  titleAfter: string,
  maxChars: number,
): OutlineSplitParts {
  const lines = splitSourceLines(text);

  if (splitAtLine > lines.length) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      `--at-line ${splitAtLine} is outside the manuscript source line range.`,
      {
        exitCode: 2,
        hints: [`The source has ${lines.length} line(s).`],
      },
    );
  }

  const beforeLines = lines.slice(0, splitAtLine - 1);
  const afterLines = lines.slice(splitAtLine - 1);

  if (!hasMeaningfulLines(beforeLines) || !hasMeaningfulLines(afterLines)) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      "Split must leave non-empty text before and after --at-line.",
      { exitCode: 2 },
    );
  }

  return {
    split_at_line: splitAtLine,
    line_count: lines.length,
    before: splitSegment(titleBefore, beforeLines, 1, maxChars),
    after: splitSegment(titleAfter, afterLines, splitAtLine, maxChars),
    before_text: beforeLines.join("\n"),
    after_text: afterLines.join("\n"),
  };
}

function outlineSplitPlan(
  text: string,
  splitAtLine: number,
  titleBefore: string,
  titleAfter: string,
  maxChars: number,
): OutlineSplitPlan {
  const { before_text: _beforeText, after_text: _afterText, ...plan } =
    outlineSplitParts(text, splitAtLine, titleBefore, titleAfter, maxChars);
  return plan;
}

function splitSourceLines(text: string): string[] {
  const withoutFinalNewline = text.replace(/\r?\n$/, "");
  return withoutFinalNewline.length > 0 ? withoutFinalNewline.split(/\r?\n/) : [""];
}

function hasMeaningfulLines(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0);
}

function splitSegment(
  title: string,
  lines: string[],
  lineStart: number,
  maxChars: number,
): OutlineSplitSegment {
  const rawText = lines.join("\n");
  const compactText = rawText.replace(/\s+/g, " ").trim();
  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0)?.trim() ?? "";

  return {
    title,
    line_start: lineStart,
    line_end: lineStart + lines.length - 1,
    char_count: rawText.trim().length,
    preview: snippetAround(compactText, 0, 0, maxChars),
    starts_with_heading: firstMeaningfulLine.startsWith("#"),
  };
}

function splitResult(
  splitPlan: OutlineSplitPlan,
  applied: boolean,
): {
  applied: boolean;
  split_at_line: number;
  before_line_range: { start: number; end: number };
  after_line_range: { start: number; end: number };
  manuscript_file_modified: boolean;
  manuscript_files_created: boolean;
  outline_modified: boolean;
  index_modified: boolean;
} {
  return {
    applied,
    split_at_line: splitPlan.split_at_line,
    before_line_range: {
      start: splitPlan.before.line_start,
      end: splitPlan.before.line_end,
    },
    after_line_range: {
      start: splitPlan.after.line_start,
      end: splitPlan.after.line_end,
    },
    manuscript_file_modified: applied,
    manuscript_files_created: applied,
    outline_modified: applied,
    index_modified: applied,
  };
}

function splitProposalData(
  target: ResolvedOutlineChapter,
  targetHash: string,
  splitPlan: OutlineSplitPlan,
  insertedId: string,
  insertedSourcePath: string,
  dryRun: boolean,
  diff: boolean,
  previewOnly: boolean,
  plannedWrites: EnvelopeWrite[],
): {
  dry_run: boolean;
  mode: "proposal" | "diff" | "confirmed_write";
  command: "openathor outline split";
  target: ReturnType<typeof outlineTargetData>;
  split_at_line: number;
  line_count: number;
  before: OutlineSplitSegment;
  after: OutlineSplitSegment;
  inserted: {
    id: string;
    display_order: number;
    title: string;
    source_path: string;
  };
  result: ReturnType<typeof splitResult>;
  user_confirmation_required: boolean;
  confirmed_write_supported: boolean;
  planned_writes: EnvelopeWrite[];
  diff: ReturnType<typeof splitDiff>;
  next_agent_action: string;
} {
  return {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline split",
    target: outlineTargetData(target, targetHash),
    split_at_line: splitPlan.split_at_line,
    line_count: splitPlan.line_count,
    before: splitPlan.before,
    after: splitPlan.after,
    inserted: {
      id: insertedId,
      display_order: target.display_order + 1,
      title: splitPlan.after.title,
      source_path: insertedSourcePath,
    },
    result: splitResult(splitPlan, false),
    user_confirmation_required: previewOnly,
    confirmed_write_supported: true,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: splitDiff(target, splitPlan, insertedId, insertedSourcePath),
    next_agent_action: previewOnly
      ? "Show the split proposal to the user and rerun with --confirm --base-hash only after explicit approval."
      : "Run openathor outline show --json and refresh context before follow-up writing.",
  };
}

function splitWrites(
  target: ResolvedOutlineChapter,
  insertedSourcePath: string,
  runRelPath: string,
  shiftsIndexedChapters: boolean,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: target.source_path ?? "",
      change_type: "modified",
      reason: "outline_split_source_before_segment",
    },
    {
      path: insertedSourcePath,
      change_type: "created",
      reason: "outline_split_source_after_segment",
    },
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_split_metadata",
    },
  ];

  if (target.indexedChapter || shiftsIndexedChapters) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_split_index",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_split_run_record",
  });

  return writes;
}

function splitDiff(
  target: ResolvedOutlineChapter,
  splitPlan: OutlineSplitPlan,
  insertedId?: string,
  insertedSourcePath?: string,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Proposal only: identify a chapter split boundary and future metadata/text edits; no files are changed.",
    changes: [
      {
        path: target.source_path ?? "",
        field: "split_at_line",
        from: null,
        to: splitPlan.split_at_line,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${target.id}].title`,
        from: target.title,
        to: splitPlan.before.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${target.id}].title`,
        from: null,
        to: splitPlan.after.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${target.id}].id`,
        from: null,
        to: insertedId ?? null,
      },
      {
        path: insertedSourcePath ?? "",
        field: "created_source",
        from: null,
        to: splitPlan.after.title,
      },
      {
        path: ".openathor/manuscript.index.yaml",
        field: `chapters[${target.id}].source_split`,
        from: null,
        to: splitPlan.after.line_start,
      },
    ],
  };
}

function splitSourcePath(
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

function splitDisplayOrderById(
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

function splitSources(
  sources: EnvelopeSource[],
  sourcePath: string,
  sourceHash: string,
): EnvelopeSource[] {
  const relevant = new Set([
    "outline/chapters.yaml",
    ".openathor/manuscript.index.yaml",
    sourcePath,
  ]);
  const sourceMap = new Map(
    sources
      .filter((source) => relevant.has(source.path))
      .map((source) => [source.path, source]),
  );

  sourceMap.set(sourcePath, { path: sourcePath, hash: sourceHash });

  return [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function replanWrites(
  affected: Array<{ source_path: string | null }>,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "future_outline_replan_metadata",
    },
  ];

  if (affected.some((chapter) => chapter.source_path)) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "future_outline_replan_index",
    });
  }

  return writes;
}

function replanDiff(
  from: ResolvedOutlineChapter,
  affected: Array<{
    id: string;
    display_order: number;
    title: string;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Proposal only: define a replan boundary and affected chapters; no files are changed.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: "replan_from",
        from: null,
        to: from.id,
      },
      ...affected.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].review_for_replan`,
        from: chapter.display_order,
        to: chapter.title,
      })),
    ],
  };
}

function replanSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function archiveResult(
  target: ResolvedOutlineChapter,
  applied: boolean,
): {
  applied: boolean;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
  manuscript_file_deleted: false;
} {
  return {
    applied,
    outline_status: applied ? "archived" : target.outline_status,
    index_status: applied && target.indexedChapter ? "archived" : target.index_status,
    manuscript_file_deleted: false,
  };
}

function archiveWrites(
  target: ResolvedOutlineChapter,
  alreadyArchived: boolean,
  runRelPath: string,
): EnvelopeWrite[] {
  if (alreadyArchived) {
    return [];
  }

  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_archive_status",
    },
  ];

  if (target.indexedChapter) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_archive_index_status",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_archive_run_record",
  });

  return writes;
}

function archiveDiff(target: ResolvedOutlineChapter): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | null;
    to: string;
  }>;
} {
  const changes: Array<{
    path: string;
    field: string;
    from: string | null;
    to: string;
  }> = [
    {
      path: "outline/chapters.yaml",
      field: `chapters[${target.id}].status`,
      from: target.outline_status,
      to: "archived",
    },
  ];

  if (target.indexedChapter) {
    changes.push({
      path: ".openathor/manuscript.index.yaml",
      field: `chapters[${target.id}].status`,
      from: target.index_status,
      to: "archived",
    });
  }

  return {
    summary: "Archive chapter metadata only; manuscript file is kept in place.",
    changes,
  };
}

function archiveSources(
  sources: EnvelopeSource[],
  sourcePath: string | null,
): EnvelopeSource[] {
  const relevant = new Set([
    "outline/chapters.yaml",
    ".openathor/manuscript.index.yaml",
    ...(sourcePath ? [sourcePath] : []),
  ]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function runSearchText(options: SearchTextOptions = {}): Promise<CommandResult> {
  const query = options.query?.trim();
  if (!query) {
    throw new OpenAthorError(
      "OA_SEARCH_QUERY_REQUIRED",
      "openathor search text requires a query.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const limit = normalizeLimit(options.limit, 20);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const matches = [];
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const relPath of relPaths) {
    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const hash = await sha256File(fullPath);
    const fileMatches = findTextMatches(text, query, maxChars).map((match) => ({
      path: relPath,
      hash,
      ...match,
    }));

    if (fileMatches.length > 0) {
      sourceMap.set(relPath, { path: relPath, hash });
      matches.push(...fileMatches);
    }

    if (matches.length >= limit) {
      break;
    }
  }

  const limitedMatches = matches.slice(0, limit);

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      query,
      limit,
      match_count: limitedMatches.length,
      truncated: matches.length > limit,
      matches: limitedMatches,
    },
  };
}

export async function runSearchRelated(
  options: SearchRelatedOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_SEARCH_UNSUPPORTED_SCOPE",
      "openathor search related currently supports only chapter scope.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const targetChapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const targetText = await readFile(path.join(projectRoot, targetChapter.source_path), "utf8");
  const targetTerms = extractSearchTerms(targetText);

  if (targetTerms.length === 0) {
    throw new OpenAthorError(
      "OA_SEARCH_RELATED_NO_TERMS",
      `Cannot extract searchable terms from ${targetChapter.id}.`,
      { exitCode: 2 },
    );
  }

  const limit = normalizeLimit(options.limit, 10);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const sourceMap = new Map<string, EnvelopeSource>();
  const results = [];

  for (const relPath of relPaths) {
    if (relPath === targetChapter.source_path) {
      continue;
    }

    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const related = relatedScore(text, targetTerms, maxChars);

    if (related.score <= 0) {
      continue;
    }

    const hash = await sha256File(fullPath);
    sourceMap.set(relPath, { path: relPath, hash });
    results.push({
      path: relPath,
      hash,
      score: related.score,
      shared_terms: related.sharedTerms,
      snippet: related.snippet,
    });
  }

  const matches = results
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, limit);

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      scope: "chapter",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: targetChapter.source_path,
      },
      method: "deterministic_term_overlap",
      limit,
      match_count: matches.length,
      target_terms: targetTerms.slice(0, 20),
      matches,
    },
  };
}

export async function runSearchSemantic(
  options: SearchSemanticOptions = {},
): Promise<CommandResult> {
  const query = options.query?.trim();
  if (!query) {
    throw new OpenAthorError(
      "OA_SEARCH_QUERY_REQUIRED",
      "openathor search semantic requires a query.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const vectorRel = path.posix.join(inspection.config.paths.vector_index, "index.json");
  const vectorPath = path.join(projectRoot, vectorRel);

  if (!(await pathExists(vectorPath))) {
    throw new OpenAthorError(
      "OA_VECTOR_INDEX_NOT_FOUND",
      "Semantic search requires a vector index.",
      {
        exitCode: 3,
        hints: ["Run openathor index rebuild --vector --json first."],
      },
    );
  }

  const vectorIndex = JSON.parse(await readFile(vectorPath, "utf8")) as VectorIndex;
  if (vectorIndex.schema_version !== "openathor.vector_index.v1") {
    throw new OpenAthorError(
      "OA_VECTOR_INDEX_INVALID",
      "Unsupported vector index schema_version.",
      { exitCode: 3 },
    );
  }

  const limit = normalizeLimit(options.limit, 10);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const queryTerms = extractSearchTerms(query);
  const queryVector = deterministicEmbedding(queryTerms.length > 0 ? queryTerms : [query]);
  const matches = vectorIndex.documents
    .map((document) => ({
      path: document.path,
      hash: document.hash,
      kind: document.kind,
      title: document.title,
      score: cosineSimilarity(queryVector, document.vector),
      shared_terms: document.terms.filter((term) => queryTerms.includes(term)).slice(0, 12),
      snippet: snippetAround(document.preview, 0, 0, maxChars),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, limit);

  const sources = [
    { path: vectorRel, hash: await sha256File(vectorPath) },
    ...matches.map((match) => ({ path: match.path, hash: match.hash })),
  ];

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: [],
    warnings: inspection.warnings,
    data: {
      query,
      method: vectorIndex.method,
      vector_index: vectorRel,
      limit,
      match_count: matches.length,
      query_terms: queryTerms.slice(0, 20),
      matches,
    },
  };
}

export async function runWritingProposal(
  options: WritingProposalOptions,
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const dryRun = options.dryRun ?? false;
  const task = options.task?.trim();

  if (!task) {
    throw new OpenAthorError(
      "OA_TASK_REQUIRED",
      `${proposalCommandName(options.kind)} requires --task <text>.`,
      { exitCode: 2 },
    );
  }

  if (options.confirmWrite) {
    return runConfirmedWriting(options, projectRoot, task, dryRun);
  }

  const context = await runContext({
    cwd: projectRoot,
    scope: proposalNeedsChapter(options.kind) ? "chapter" : "project",
    target: proposalNeedsChapter(options.kind) ? options.target : undefined,
  });
  const contextData = context.data as {
    context_pack: {
      scope: string;
      target: { id: string; display_order: number; title: string; source_path: string } | null;
    };
  };
  const conflicts = detectCanonConflicts(context.data, task);

  if (conflicts.length > 0) {
    throw new OpenAthorError(
      "OA_CANON_CONFLICT",
      `User task conflicts with ${conflicts.length} confirmed canon rule(s).`,
      {
        exitCode: 4,
        hints: conflicts.map((conflict) =>
          `${conflict.source}: ${conflict.statement}`,
        ),
      },
    );
  }

  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_${options.kind}.json`;
  const proposalRelPath = proposalPath(options.kind, stamp, contextData.context_pack.target);
  const writes: EnvelopeWrite[] = [
    {
      path: runRelPath,
      change_type: "created",
      reason: `${options.kind}_run_record`,
    },
    {
      path: proposalRelPath,
      change_type: (await pathExists(path.join(projectRoot, proposalRelPath)))
        ? "modified"
        : "created",
      reason: `${options.kind}_proposal`,
    },
  ];

  if (!dryRun) {
    const runRecord = {
      agent_role: "openathor-cli",
      command: proposalCommandName(options.kind),
      created_at: new Date().toISOString(),
      task,
      target: contextData.context_pack.target,
      sources: context.sources ?? [],
      writes,
      mode: "proposal",
      user_confirmation_required: true,
    };
    await writeYaml(projectRoot, runRelPath, runRecord);

    if (options.kind === "canon_sync") {
      await appendText(
        projectRoot,
        proposalRelPath,
        canonPendingProposalText(task, stamp, contextData.context_pack.target),
      );
    } else {
      await writeText(
        projectRoot,
        proposalRelPath,
        proposalMarkdown(options.kind, task, stamp, contextData.context_pack.target),
      );
    }
  }

  return {
    projectRoot,
    projectId: context.projectId,
    sources: context.sources,
    writes: dryRun ? [] : writes,
    warnings: context.warnings,
    data: {
      dry_run: dryRun,
      mode: "proposal",
      command: proposalCommandName(options.kind),
      task,
      target: contextData.context_pack.target,
      context_pack: contextData.context_pack,
      planned_writes: dryRun ? writes : [],
      proposal_path: proposalRelPath,
      run_path: runRelPath,
      user_confirmation_required: true,
      next_agent_action: proposalNextAction(options.kind),
    },
  };
}

async function runConfirmedWriting(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  if (options.kind === "revise") {
    return runConfirmedRevision(options, projectRoot, task, dryRun);
  }

  if (options.kind !== "draft") {
    throw new OpenAthorError(
      "OA_CONFIRMED_WRITE_UNSUPPORTED",
      "Confirmed writes are currently supported only for draft chapter next and revise chapter.",
      { exitCode: 2 },
    );
  }

  if (options.target !== "next") {
    throw new OpenAthorError(
      "OA_CONFIRMED_WRITE_UNSUPPORTED",
      "Confirmed draft writes currently require target 'next' to avoid overwriting existing manuscript files.",
      { exitCode: 2 },
    );
  }

  const text = options.text?.trim();
  if (!text) {
    throw new OpenAthorError(
      "OA_DRAFT_TEXT_REQUIRED",
      "Confirmed draft writes require --text <manuscript text>.",
      { exitCode: 2 },
    );
  }

  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const nextOrder = nextDisplayOrder(inspection.manuscriptIndex);
  const chapterId = uniqueNewChapterId(nextOrder, inspection.manuscriptIndex);
  const title =
    firstMarkdownHeading(text) ??
    titleFromTask(task) ??
    inspection.config.project.title ??
    `Chapter ${nextOrder}`;
  const sourcePath = `manuscript/chapter-${String(nextOrder).padStart(3, "0")}.md`;
  const fullSourcePath = path.join(projectRoot, sourcePath);
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_draft_confirmed.json`;
  const writes: EnvelopeWrite[] = [
    {
      path: sourcePath,
      change_type: "created",
      reason: "confirmed_draft_chapter",
    },
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "confirmed_draft_chapter_outline",
    },
    {
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "confirmed_draft_chapter_index",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "confirmed_draft_run_record",
    },
  ];

  if (await pathExists(fullSourcePath)) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_TARGET_EXISTS",
      `Refusing to overwrite existing manuscript file ${sourcePath}.`,
      { exitCode: 3 },
    );
  }

  if (!dryRun) {
    await writeText(projectRoot, sourcePath, ensureTrailingNewline(text));
    const contentHash = await sha256File(fullSourcePath);
    const updatedChapters: ChapterOutline = {
      chapters: [
        ...inspection.chapters.chapters,
        {
          id: chapterId,
          display_order: nextOrder,
          title,
          status: "drafted",
          manuscript_path: sourcePath,
        },
      ],
    };
    const updatedIndex: ManuscriptIndex = {
      ...inspection.manuscriptIndex,
      generated_at: new Date().toISOString(),
      chapters: [
        ...inspection.manuscriptIndex.chapters,
        {
          id: chapterId,
          display_order: nextOrder,
          title,
          source_path: sourcePath,
          status: "drafted",
          origin: "created",
          content_hash: contentHash,
          detected_title: title,
          confidence: "high",
        },
      ],
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor draft",
      created_at: new Date().toISOString(),
      task,
      mode: "confirmed_write",
      target: {
        id: chapterId,
        display_order: nextOrder,
        title,
        source_path: sourcePath,
      },
      writes,
      sources: inspection.sources,
      user_confirmation_required: false,
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: {
      dry_run: dryRun,
      mode: "confirmed_write",
      command: "openathor draft",
      task,
      target: {
        id: chapterId,
        display_order: nextOrder,
        title,
        source_path: sourcePath,
      },
      planned_writes: dryRun ? writes : [],
      run_path: runRelPath,
      user_confirmation_required: false,
    },
  };
}

async function runConfirmedRevision(
  options: WritingProposalOptions,
  projectRoot: string,
  task: string,
  dryRun: boolean,
): Promise<CommandResult> {
  const text = options.text?.trim();
  if (!text) {
    throw new OpenAthorError(
      "OA_REVISE_TEXT_REQUIRED",
      "Confirmed revision writes require --text <manuscript text>.",
      { exitCode: 2 },
    );
  }

  if (!options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed revision writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const chapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const fullSourcePath = path.join(projectRoot, chapter.source_path);
  const currentHash = await sha256File(fullSourcePath);

  if (currentHash !== options.baseHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to revise ${chapter.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${currentHash}.`,
          "Regenerate context and ask the user to confirm the latest text.",
        ],
      },
    );
  }

  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_revise_confirmed.json`;
  const writes: EnvelopeWrite[] = [
    {
      path: chapter.source_path,
      change_type: "modified",
      reason: "confirmed_revision",
    },
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "confirmed_revision_outline",
    },
    {
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "confirmed_revision_index",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "confirmed_revision_run_record",
    },
  ];
  const title = firstMarkdownHeading(text) ?? chapter.title;

  if (!dryRun) {
    await writeText(projectRoot, chapter.source_path, ensureTrailingNewline(text));
    const contentHash = await sha256File(fullSourcePath);
    const updatedChapters: ChapterOutline = {
      chapters: inspection.chapters.chapters.map((outlineChapter) =>
        outlineChapter.id === chapter.id
          ? {
              ...outlineChapter,
              title,
              status: "revised",
              manuscript_path: chapter.source_path,
            }
          : outlineChapter,
      ),
    };
    const updatedIndex: ManuscriptIndex = {
      ...inspection.manuscriptIndex,
      generated_at: new Date().toISOString(),
      chapters: inspection.manuscriptIndex.chapters.map((indexedChapter) =>
        indexedChapter.id === chapter.id
          ? {
              ...indexedChapter,
              title,
              status: "revised",
              content_hash: contentHash,
              detected_title: title,
            }
          : indexedChapter,
      ),
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor revise",
      created_at: new Date().toISOString(),
      task,
      mode: "confirmed_write",
      target: {
        id: chapter.id,
        display_order: chapter.display_order,
        title,
        source_path: chapter.source_path,
      },
      base_hash: options.baseHash,
      writes,
      sources: inspection.sources,
      user_confirmation_required: false,
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: {
      dry_run: dryRun,
      mode: "confirmed_write",
      command: "openathor revise",
      task,
      target: {
        id: chapter.id,
        display_order: chapter.display_order,
        title,
        source_path: chapter.source_path,
      },
      base_hash: options.baseHash,
      planned_writes: dryRun ? writes : [],
      run_path: runRelPath,
      user_confirmation_required: false,
    },
  };
}

function createProjectConfig(title: string, language: string): ProjectConfig {
  return {
    protocol_version: PROTOCOL_VERSION,
    project: {
      id: stableProjectId(title),
      title,
      language,
      created_at: new Date().toISOString(),
      source_policy: "plaintext",
    },
    agent: {
      primary: "pi",
      skill: "openathor-pi",
      skill_version: PROTOCOL_VERSION,
    },
    paths: DEFAULT_PATHS,
    features: {
      vector_search: "optional",
      sub_agents: "optional",
    },
  };
}

async function writeProjectSkeleton(
  projectRoot: string,
  config: ProjectConfig,
  input: {
    sourceMode: ManuscriptIndex["source_mode"];
    chapters: IndexedChapter[];
    unclassified: Array<{ path: string; reason: string }>;
    questions: ManuscriptIndex["questions"];
    chapterOutline?: ChapterOutline;
    extraWrites: EnvelopeWrite[];
  },
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });

  for (const dir of REQUIRED_DIRECTORIES) {
    await mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  for (const dir of STANDARD_ASSET_DIRECTORIES) {
    await mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  await mkdir(path.join(projectRoot, ".openathor"), { recursive: true });

  await writeYaml(projectRoot, "openathor.yaml", config);
  await writeText(projectRoot, "bible/premise.md", "# Premise\n\n");
  await writeText(projectRoot, "bible/style.md", "# Style\n\n");
  await writeText(projectRoot, "bible/world.md", "# World\n\n");
  await writeText(projectRoot, "bible/characters.md", "# Characters\n\n");
  await writeText(projectRoot, "bible/timeline.md", "# Timeline\n\n");
  await writeText(projectRoot, "bible/canon.md", "# Confirmed Canon\n\n");
  await writeText(projectRoot, "bible/canon.pending.md", "# Pending Canon\n\n");
  await writeText(projectRoot, "notes/hooks.md", "# Hooks\n\n");
  await writeText(projectRoot, "notes/unresolved.md", "# Unresolved Questions\n\n");
  await writeText(projectRoot, "notes/import-questions.md", "# Import Questions\n\n");
  await writeYaml(projectRoot, "style/profiles.yaml", { profiles: [] });
  await writeYaml(projectRoot, "style/references.yaml", { references: [] });
  await writeYaml(projectRoot, "outline/volumes.yaml", { volumes: [] });
  await writeYaml(projectRoot, "outline/chapters.yaml", input.chapterOutline ?? { chapters: [] });
  await writeYaml(projectRoot, "outline/scenes.yaml", { scenes: [] });
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", {
    version: PROTOCOL_VERSION,
    generated_at: new Date().toISOString(),
    source_mode: input.sourceMode,
    chapters: input.chapters,
    unclassified: input.unclassified,
    questions: input.questions,
  });
}

async function writeAdoptSidecars(
  projectRoot: string,
  input: {
    notes: ClassifiedFile[];
    styleReferences: ClassifiedFile[];
    scraps: ClassifiedFile[];
    unclassified: ClassifiedFile[];
    questions: ManuscriptIndex["questions"];
    warnings: EnvelopeWarning[];
  },
): Promise<void> {
  const report = [
    "# Import Report",
    "",
    "## Detected Notes",
    ...input.notes.map((file) => `- ${file.path}`),
    "",
    "## Style References",
    ...input.styleReferences.map((file) => `- ${file.path}`),
    "",
    "## Unclassified Or Scrap Files",
    ...[...input.scraps, ...input.unclassified].map((file) => `- ${file.path}: ${file.reason}`),
    "",
    "## Warnings",
    ...input.warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
    "",
  ].join("\n");

  const questions = [
    "# Import Questions",
    "",
    ...(input.questions ?? []).map(
      (question) => `- [ ] ${question.path}: ${question.question}`,
    ),
    "",
  ].join("\n");

  await writeText(projectRoot, ".openathor/import-report.md", report);
  await writeText(projectRoot, "notes/import-questions.md", questions);
  await writeText(
    projectRoot,
    "bible/canon.pending.md",
    "# Pending Canon\n\nImported notes are pending until the user confirms them.\n",
  );
  await writeText(
    projectRoot,
    "bible/style.md",
    "# Style\n\nStyle references are detected but not copied into confirmed style rules.\n",
  );
  await writeYaml(projectRoot, `runs/run_${runStamp()}.json`, {
    agent_role: "openathor-cli",
    command: "openathor adopt",
    created_at: new Date().toISOString(),
    warnings: input.warnings,
  });
}

async function inspectProject(
  projectRoot: string,
  options: { includeIndexWarning: boolean },
): Promise<{
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
  sources: EnvelopeSource[];
  warnings: EnvelopeWarning[];
  checks: Record<string, boolean>;
}> {
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

  const sources = await hashSources(projectRoot, [
    "openathor.yaml",
    chaptersRel,
    volumesRel,
    scenesRel,
    manuscriptIndexRel,
    ...STANDARD_ASSET_FILES,
    ...manuscriptIndex.chapters.map((chapter) => chapter.source_path),
  ]);

  const warnings: EnvelopeWarning[] = [];
  for (const relPath of STANDARD_ASSET_FILES) {
    if (!(await pathExists(path.join(projectRoot, relPath)))) {
      warnings.push({
        code: "OA_PROJECT_ASSET_MISSING",
        message: `Standard project asset is missing: ${relPath}`,
        severity: "medium",
      });
    }
  }

  const indexedChapterIds = new Set(manuscriptIndex.chapters.map((chapter) => chapter.id));
  for (const chapter of chapters.chapters) {
    if (chapter.status !== "planned" && chapter.manuscript_path && !indexedChapterIds.has(chapter.id)) {
      warnings.push({
        code: "OA_MANUSCRIPT_INDEX_STALE",
        message: `Manuscript index is missing outlined chapter ${chapter.id}.`,
        severity: "medium",
      });
    }
  }

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

async function rebuildManuscriptIndexFromOutline(
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

async function inspectionWithManuscriptIndex(
  projectRoot: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
  manuscriptIndex: ManuscriptIndex,
): Promise<Awaited<ReturnType<typeof inspectProject>>> {
  const sources = await hashSources(projectRoot, [
    "openathor.yaml",
    path.join(inspection.config.paths.outline, "chapters.yaml"),
    path.join(inspection.config.paths.outline, "volumes.yaml"),
    path.join(inspection.config.paths.outline, "scenes.yaml"),
    inspection.config.paths.manuscript_index,
    ...STANDARD_ASSET_FILES,
    ...manuscriptIndex.chapters.map((chapter) => chapter.source_path),
  ]);

  const assetMissing = [];
  for (const relPath of STANDARD_ASSET_FILES) {
    if (!(await pathExists(path.join(projectRoot, relPath)))) {
      assetMissing.push(relPath);
    }
  }

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

function outlineStatusToIndexStatus(status: ChapterOutlineEntry["status"]): IndexedChapter["status"] {
  if (status === "archived") {
    return "archived";
  }

  if (status === "revised") {
    return "revised";
  }

  return "drafted";
}

async function writeSqliteIndex(
  sqlitePath: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
): Promise<void> {
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

async function readProjectId(projectRoot: string): Promise<string | null> {
  const rawConfig = await readYamlFile(path.join(projectRoot, "openathor.yaml"));
  await validateSchema("openathor", rawConfig, "openathor.yaml");
  return (rawConfig as ProjectConfig).project.id;
}

async function readContextSource(
  projectRoot: string,
  relPath: string,
  maxChars: number,
  sources: Map<string, EnvelopeSource>,
): Promise<{
  path: string;
  hash: string | null;
  text: string;
  truncated: boolean;
}> {
  const fullPath = path.join(projectRoot, relPath);

  if (!(await pathExists(fullPath))) {
    return {
      path: relPath,
      hash: null,
      text: "",
      truncated: false,
    };
  }

  const hash = await sha256File(fullPath);
  const text = await readFile(fullPath, "utf8");
  sources.set(relPath, { path: relPath, hash });

  return {
    path: relPath,
    hash,
    ...truncateText(text, maxChars),
  };
}

async function readNotesContext(
  projectRoot: string,
  notesRelPath: string,
  maxChars: number,
  sources: Map<string, EnvelopeSource>,
): Promise<Array<{
  path: string;
  hash: string | null;
  text: string;
  truncated: boolean;
}>> {
  const notesDir = path.join(projectRoot, notesRelPath);
  const files: string[] = [];

  if (!(await pathExists(notesDir))) {
    return [];
  }

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isTextCandidate(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(notesDir);

  const result = [];
  for (const relPath of files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).slice(0, 8)) {
    result.push(await readContextSource(projectRoot, relPath, maxChars, sources));
  }

  return result;
}

async function readAssetAuditSources(
  projectRoot: string,
  sources: Map<string, EnvelopeSource>,
): Promise<{
  world: Awaited<ReturnType<typeof readContextSource>>;
  characters: Awaited<ReturnType<typeof readContextSource>>;
  timeline: Awaited<ReturnType<typeof readContextSource>>;
  hooks: Awaited<ReturnType<typeof readContextSource>>;
  canon: Awaited<ReturnType<typeof readContextSource>>;
  pendingCanon: Awaited<ReturnType<typeof readContextSource>>;
}> {
  const maxChars = Number.MAX_SAFE_INTEGER;

  return {
    world: await readContextSource(projectRoot, "bible/world.md", maxChars, sources),
    characters: await readContextSource(projectRoot, "bible/characters.md", maxChars, sources),
    timeline: await readContextSource(projectRoot, "bible/timeline.md", maxChars, sources),
    hooks: await readContextSource(projectRoot, "notes/hooks.md", maxChars, sources),
    canon: await readContextSource(projectRoot, "bible/canon.md", maxChars, sources),
    pendingCanon: await readContextSource(
      projectRoot,
      "bible/canon.pending.md",
      maxChars,
      sources,
    ),
  };
}

function extractMarkdownEntities(
  text: string,
  sourcePath: string,
  kind: AssetEntity["kind"],
): AssetEntity[] {
  const entities = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const heading = line.match(/^#{2,6}\s+(.+)$/u)?.[1]?.trim();
    const inlineEntity = parseInlineAssetEntity(heading ?? line, kind, Boolean(heading));
    const listEntity = !heading ? parseListAssetEntity(lines, index, kind) : null;
    const idField = heading
      ? findAssetIdField(lines, index + 1, kind)
      : inlineEntity?.id ?? null;
    const id = inlineEntity?.id ?? listEntity?.id ?? idField;
    const name = cleanAssetName(inlineEntity?.name ?? listEntity?.name ?? heading ?? "");

    if (!name || isGenericAssetHeading(name)) {
      continue;
    }

    const key = `${kind}:${name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entities.push({
      id,
      name,
      source_path: sourcePath,
      line: index + 1,
      kind,
    });
  }

  return entities.slice(0, 200);
}

function parseInlineAssetEntity(
  value: string,
  kind: AssetEntity["kind"],
  allowNameOnly: boolean,
): { id: string | null; name: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const idFirst = trimmed.match(/^([a-z][a-z0-9_:-]{2,})\s*[:：]\s*(.+)$/iu);
  if (idFirst && isLegacyAssetIdForKind(idFirst[1], kind)) {
    return { id: idFirst[1], name: idFirst[2] };
  }

  const bulletIdFirst = trimmed.match(
    /^[-*]\s+([a-z][a-z0-9_:-]{2,})\s*[:：]\s*(.+)$/iu,
  );
  if (bulletIdFirst && isLegacyAssetIdForKind(bulletIdFirst[1], kind)) {
    return { id: bulletIdFirst[1], name: bulletIdFirst[2] };
  }

  const trailingParen = trimmed.match(/^(.*?)\s*[\(（]([a-z][a-z0-9_:-]{2,})[\)）]\s*$/iu);
  if (trailingParen && isAssetIdForKind(trailingParen[2], kind)) {
    return { id: trailingParen[2], name: trailingParen[1] };
  }

  const headingRawId = trimmed.match(/^([a-z][a-z0-9_:-]{2,})\b/iu)?.[1] ?? null;
  if (headingRawId && isLegacyAssetIdForKind(headingRawId, kind)) {
    return { id: headingRawId, name: trimmed };
  }

  return allowNameOnly ? { id: null, name: trimmed } : null;
}

function parseListAssetEntity(
  lines: string[],
  index: number,
  kind: AssetEntity["kind"],
): { id: string; name: string } | null {
  const line = lines[index].trim();
  const idLine = line.match(/^[-*]\s+(?:\*\*)?id(?:\*\*)?\s*[:：]\s*`?([a-z][a-z0-9_:-]{2,})`?\s*$/iu);
  if (!idLine || !isAssetIdForKind(idLine[1], kind)) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    const trimmed = candidate.trim();

    if (!trimmed) {
      continue;
    }

    if (/^#{1,6}\s+/u.test(trimmed) || /^[-*]\s+/.test(trimmed)) {
      break;
    }

    const nameField = trimmed.match(
      /^(?:\*\*)?(?:name|title|名称|名字|事件|钩子|hook|event)(?:\*\*)?\s*[:：]\s*(.+)$/iu,
    );
    if (nameField) {
      return { id: idLine[1], name: nameField[1] };
    }
  }

  return { id: idLine[1], name: idLine[1] };
}

function findAssetIdField(
  lines: string[],
  startIndex: number,
  kind: AssetEntity["kind"],
): string | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      continue;
    }

    if (/^#{1,6}\s+/u.test(line)) {
      return null;
    }

    const idField = line.match(
      /^(?:[-*]\s*)?(?:\*\*)?id(?:\*\*)?\s*[:：]\s*`?([a-z][a-z0-9_:-]{2,})`?\s*$/iu,
    );
    if (idField && isAssetIdForKind(idField[1], kind)) {
      return idField[1];
    }
  }

  return null;
}

function cleanAssetName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/^[#*\-\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericAssetHeading(value: string): boolean {
  return /^(人物档案|次要人物|时间线|历史事件|故事时间线|待填充时间节点|世界观设定|时代背景|城市地理|技术特征|社会环境|悬念钩子|role|traits|current_state|basic|notes?|hooks?|unresolved|pending|confirmed canon|characters?|timeline|world|style)$/i.test(
    value,
  );
}

function isAssetIdForKind(id: string, kind: AssetEntity["kind"]): boolean {
  const normalized = id.toLowerCase();
  if (isLegacyAssetIdForKind(normalized, kind)) {
    return true;
  }

  if (kind === "character") {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(normalized);
  }
  if (kind === "timeline_event") {
    return normalized.startsWith("event-");
  }
  if (kind === "hook") {
    return normalized.startsWith("hook-");
  }

  return /^(loc|org|item|world)[_-]/.test(normalized);
}

function isLegacyAssetIdForKind(id: string, kind: AssetEntity["kind"]): boolean {
  const normalized = id.toLowerCase();
  if (kind === "character") {
    return normalized.startsWith("char_");
  }
  if (kind === "timeline_event") {
    return normalized.startsWith("ev_");
  }
  if (kind === "hook") {
    return normalized.startsWith("hook_");
  }

  return /^(loc|org|item|world)_/.test(normalized);
}

function assetLookup(entities: AssetEntity[]): Map<string, AssetEntity> {
  const lookup = new Map<string, AssetEntity>();

  for (const entity of entities) {
    lookup.set(entity.name, entity);
    if (entity.id) {
      lookup.set(entity.id, entity);
    }
  }

  return lookup;
}

function addLinkedAssetRef(
  linkedAssetRefs: Set<string>,
  entity: AssetEntity | undefined,
  original: string,
): void {
  linkedAssetRefs.add(original);

  if (entity) {
    linkedAssetRefs.add(entity.name);
    if (entity.id) {
      linkedAssetRefs.add(entity.id);
    }
  }
}

function stringLinks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function extractAssetAuditTerms(text: string): string[] {
  const terms = new Set<string>();
  const normalized = text.toLowerCase();

  for (const token of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!SEARCH_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  for (const token of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    if (!SEARCH_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  return [...terms].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).slice(0, 80);
}

function summarizeAssetCoverage(
  summary: string,
  chapterText: string,
): {
  total_terms: number;
  coverage_ratio: number;
  segment_count: number;
  segment_coverage_ratio: number;
  matched_terms: string[];
  missing_terms: string[];
} {
  const summaryTerms = extractAssetAuditCoverageTerms(summary).slice(0, 80);
  const normalizedChapterText = normalizeAssetAuditText(chapterText);
  const matchedTerms = [];
  const missingTerms = [];

  for (const term of summaryTerms) {
    if (normalizedChapterText.includes(term)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  return {
    total_terms: summaryTerms.length,
    coverage_ratio:
      summaryTerms.length === 0
        ? 1
        : roundTwo(matchedTerms.length / summaryTerms.length),
    ...summarizeAssetSegmentCoverage(summary, normalizedChapterText),
    matched_terms: matchedTerms,
    missing_terms: missingTerms,
  };
}

function summarizeAssetSegmentCoverage(
  summary: string,
  normalizedChapterText: string,
): {
  segment_count: number;
  segment_coverage_ratio: number;
} {
  const segments = summary
    .split(/[。！？!?；;，,、]+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  let matchedSegments = 0;

  for (const segment of segments) {
    const terms = extractAssetAuditCoverageTerms(segment).slice(0, 24);
    if (terms.length === 0) {
      continue;
    }

    const matches = terms.filter((term) => normalizedChapterText.includes(term)).length;
    const requiredMatches = Math.min(3, Math.ceil(terms.length * 0.22));
    if (matches >= requiredMatches) {
      matchedSegments += 1;
    }
  }

  return {
    segment_count: segments.length,
    segment_coverage_ratio:
      segments.length === 0 ? 1 : roundTwo(matchedSegments / segments.length),
  };
}

function extractAssetAuditCoverageTerms(text: string): string[] {
  const terms = new Set<string>();
  const normalized = normalizeAssetAuditText(text);

  for (const token of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!SEARCH_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  for (const phrase of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (const token of cjkNgrams(phrase)) {
      if (!SEARCH_STOP_WORDS.has(token)) {
        terms.add(token);
      }
    }
  }

  return [...terms].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function normalizeAssetAuditText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

async function readAssetSyncPackage(
  projectRoot: string,
  safeRelPath: string,
): Promise<AssetSyncPackage> {
  const fullPath = path.join(projectRoot, safeRelPath);

  if (!(await pathExists(fullPath))) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_NOT_FOUND",
      `Asset sync package not found: ${safeRelPath}`,
      { exitCode: 2 },
    );
  }

  const text = await readFile(fullPath, "utf8");
  let parsed: unknown;

  try {
    parsed =
      safeRelPath.endsWith(".json") || safeRelPath.endsWith(".jsonc")
        ? JSON.parse(text)
        : parseYaml(text);
  } catch (error) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_INVALID",
      `Cannot parse asset sync package ${safeRelPath}: ${String(error)}`,
      { exitCode: 3 },
    );
  }

  return normalizeAssetSyncPackage(parsed);
}

function normalizeAssetSyncPackagePath(relPath: string | undefined): string {
  if (!relPath?.trim()) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_REQUIRED",
      "openathor assets sync requires --from <asset-package.json|yaml>.",
      { exitCode: 2 },
    );
  }

  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "--from");

  return safeRelPath;
}

function normalizeAssetSyncPackage(value: unknown): AssetSyncPackage {
  if (!isPlainRecord(value)) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_INVALID",
      "Asset sync package must be a JSON/YAML object.",
      { exitCode: 3 },
    );
  }

  const record = value;
  const chapterRecord = isPlainRecord(record.chapter) ? record.chapter : {};
  const linksRecord = isPlainRecord(chapterRecord.links) ? chapterRecord.links : {};
  const pkg: AssetSyncPackage = {
    characters: normalizeAssetSyncCharacters(record.characters),
    timeline_events: normalizeAssetSyncTimelineEvents(record.timeline_events),
    hooks: normalizeAssetSyncHooks(record.hooks),
    chapter: {
      summary: optionalString(chapterRecord.summary),
      links: {
        characters: stringArray(linksRecord.characters),
        timeline_events: stringArray(linksRecord.timeline_events),
        hooks: stringArray(linksRecord.hooks),
      },
    },
  };

  const linkedCharacterIds = new Set(pkg.chapter.links.characters);
  const linkedTimelineIds = new Set(pkg.chapter.links.timeline_events);
  const linkedHookIds = new Set(pkg.chapter.links.hooks);

  for (const character of pkg.characters) {
    linkedCharacterIds.add(character.id);
  }
  for (const event of pkg.timeline_events) {
    linkedTimelineIds.add(event.id);
  }
  for (const hook of pkg.hooks) {
    linkedHookIds.add(hook.id);
  }

  pkg.chapter.links = {
    characters: [...linkedCharacterIds],
    timeline_events: [...linkedTimelineIds],
    hooks: [...linkedHookIds],
  };

  return pkg;
}

function normalizeAssetSyncCharacters(value: unknown): AssetSyncCharacter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("characters", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "character", "characters", index);
    const name = requiredAssetSyncString(item.name, "characters", index, "name");

    return {
      id,
      name,
      role: optionalString(item.role),
      traits: stringArray(item.traits),
      current_state: optionalString(item.current_state),
      notes: stringArray(item.notes),
    };
  });
}

function normalizeAssetSyncTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("timeline_events", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "timeline_event", "timeline_events", index);

    return {
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(item.summary, "timeline_events", index, "title"),
      summary: optionalString(item.summary),
      notes: stringArray(item.notes),
    };
  });
}

function normalizeAssetSyncHooks(value: unknown): AssetSyncHook[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("hooks", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "hook", "hooks", index);

    return {
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(item.summary, "hooks", index, "title"),
      status: optionalString(item.status),
      summary: optionalString(item.summary),
      notes: stringArray(item.notes),
    };
  });
}

function requiredAssetSyncId(
  value: unknown,
  kind: AssetEntity["kind"],
  section: string,
  index: number,
): string {
  const id = requiredAssetSyncString(value, section, index, "id");
  if (!isAssetIdForKind(id, kind)) {
    throw invalidAssetSyncItem(section, index, `id ${id} is not valid for ${kind}`);
  }

  return id;
}

function requiredAssetSyncString(
  value: unknown,
  section: string,
  index: number,
  field: string,
): string {
  const text = optionalString(value);
  if (!text) {
    throw invalidAssetSyncItem(section, index, `requires ${field}`);
  }

  return text;
}

function invalidAssetSyncItem(section: string, index: number, reason: string): OpenAthorError {
  return new OpenAthorError(
    "OA_ASSETS_SYNC_PACKAGE_INVALID",
    `Invalid asset sync package item ${section}.${index}: ${reason}.`,
    { exitCode: 3 },
  );
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return uniqueLimited(
    values
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0),
    100,
  );
}

function buildAssetSyncPlan(
  syncPackage: AssetSyncPackage,
  assetFiles: Awaited<ReturnType<typeof readAssetAuditSources>>,
  targetOutline: ChapterOutlineEntry | null,
): AssetSyncPlan {
  const existingCharacters = assetLookup(
    extractMarkdownEntities(assetFiles.characters.text, "bible/characters.md", "character"),
  );
  const existingTimelineEvents = assetLookup(
    extractMarkdownEntities(
      assetFiles.timeline.text,
      "bible/timeline.md",
      "timeline_event",
    ),
  );
  const existingHooks = assetLookup(
    extractMarkdownEntities(assetFiles.hooks.text, "notes/hooks.md", "hook"),
  );
  const targetLinks = targetOutline?.links ?? {};
  const currentLinks = {
    characters: stringLinks(targetLinks.characters),
    timeline_events: stringLinks(targetLinks.timeline_events),
    hooks: stringLinks(targetLinks.hooks),
  };
  const outlineLinks = {
    characters: uniqueLimited(
      [...currentLinks.characters, ...syncPackage.chapter.links.characters],
      100,
    ),
    timeline_events: uniqueLimited(
      [...currentLinks.timeline_events, ...syncPackage.chapter.links.timeline_events],
      100,
    ),
    hooks: uniqueLimited([...currentLinks.hooks, ...syncPackage.chapter.links.hooks], 100),
  };

  const summaryModified =
    Boolean(syncPackage.chapter.summary) &&
    syncPackage.chapter.summary !== (targetOutline?.summary ?? null);
  const linksModified =
    outlineLinks.characters.join("\u0000") !== currentLinks.characters.join("\u0000") ||
    outlineLinks.timeline_events.join("\u0000") !==
      currentLinks.timeline_events.join("\u0000") ||
    outlineLinks.hooks.join("\u0000") !== currentLinks.hooks.join("\u0000");

  return {
    package: syncPackage,
    new_characters: syncPackage.characters.filter(
      (item) => !existingCharacters.has(item.id) && !existingCharacters.has(item.name),
    ),
    existing_characters: syncPackage.characters.filter(
      (item) => existingCharacters.has(item.id) || existingCharacters.has(item.name),
    ),
    new_timeline_events: syncPackage.timeline_events.filter(
      (item) => !existingTimelineEvents.has(item.id) && !existingTimelineEvents.has(item.title),
    ),
    existing_timeline_events: syncPackage.timeline_events.filter(
      (item) => existingTimelineEvents.has(item.id) || existingTimelineEvents.has(item.title),
    ),
    new_hooks: syncPackage.hooks.filter(
      (item) => !existingHooks.has(item.id) && !existingHooks.has(item.title),
    ),
    existing_hooks: syncPackage.hooks.filter(
      (item) => existingHooks.has(item.id) || existingHooks.has(item.title),
    ),
    outline_links: outlineLinks,
    outline_modified: summaryModified || linksModified,
  };
}

function assetSyncWrites(
  confirm: boolean,
  plan: AssetSyncPlan,
  runRelPath: string,
  proposalRelPath: string,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: runRelPath,
      change_type: "created",
      reason: "assets_sync_run_record",
    },
  ];

  if (!confirm) {
    writes.push({
      path: proposalRelPath,
      change_type: "modified",
      reason: "assets_sync_pending_proposal",
    });
    return writes;
  }

  if (plan.new_characters.length > 0) {
    writes.push({
      path: "bible/characters.md",
      change_type: "modified",
      reason: "assets_sync_new_characters",
    });
  }

  if (plan.new_timeline_events.length > 0) {
    writes.push({
      path: "bible/timeline.md",
      change_type: "modified",
      reason: "assets_sync_new_timeline_events",
    });
  }

  if (plan.new_hooks.length > 0) {
    writes.push({
      path: "notes/hooks.md",
      change_type: "modified",
      reason: "assets_sync_new_hooks",
    });
  }

  if (plan.outline_modified) {
    writes.push({
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "assets_sync_chapter_outline_links",
    });
  }

  if (
    plan.existing_characters.length > 0 ||
    plan.existing_timeline_events.length > 0 ||
    plan.existing_hooks.length > 0
  ) {
    writes.push({
      path: proposalRelPath,
      change_type: "modified",
      reason: "assets_sync_existing_asset_update_pending",
    });
  }

  return writes;
}

async function writeAssetSyncConfirmed(
  projectRoot: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
  targetChapter: IndexedChapter,
  plan: AssetSyncPlan,
): Promise<void> {
  if (plan.new_characters.length > 0) {
    await appendText(
      projectRoot,
      "bible/characters.md",
      assetSyncCharactersMarkdown(plan.new_characters),
    );
  }

  if (plan.new_timeline_events.length > 0) {
    await appendText(
      projectRoot,
      "bible/timeline.md",
      assetSyncTimelineMarkdown(plan.new_timeline_events),
    );
  }

  if (plan.new_hooks.length > 0) {
    await appendText(projectRoot, "notes/hooks.md", assetSyncHooksMarkdown(plan.new_hooks));
  }

  if (
    plan.existing_characters.length > 0 ||
    plan.existing_timeline_events.length > 0 ||
    plan.existing_hooks.length > 0
  ) {
    await appendText(
      projectRoot,
      "bible/canon.pending.md",
      assetSyncExistingUpdatePendingText(plan),
    );
  }

  if (plan.outline_modified) {
    const updatedChapters: ChapterOutline = {
      chapters: inspection.chapters.chapters.map((chapter) =>
        chapter.id === targetChapter.id
          ? {
              ...chapter,
              status: chapter.status === "planned" ? "drafted" : chapter.status,
              summary: plan.package.chapter.summary ?? chapter.summary,
              links: {
                ...(chapter.links ?? {}),
                characters: plan.outline_links.characters,
                timeline_events: plan.outline_links.timeline_events,
                hooks: plan.outline_links.hooks,
              },
            }
          : chapter,
      ),
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  }
}

function assetSyncPendingText(
  stamp: string,
  targetChapter: IndexedChapter,
  sourceHash: string,
  plan: AssetSyncPlan,
): string {
  return [
    "",
    `## pending_${stamp}: Asset Sync Proposal`,
    "",
    "- status: pending",
    `- source_ref: ${targetChapter.id}`,
    `- source: ${targetChapter.source_path}`,
    `- source_hash: ${sourceHash}`,
    "- user_confirmation_required: true",
    "",
    "Summary:",
    "",
    `- new_characters: ${plan.new_characters.map((item) => `${item.name} (${item.id})`).join(", ") || "none"}`,
    `- new_timeline_events: ${plan.new_timeline_events.map((item) => `${item.title} (${item.id})`).join(", ") || "none"}`,
    `- new_hooks: ${plan.new_hooks.map((item) => `${item.title} (${item.id})`).join(", ") || "none"}`,
    `- existing_asset_updates_pending: ${
      plan.existing_characters.length + plan.existing_timeline_events.length + plan.existing_hooks.length
    }`,
    "",
    "Chapter summary:",
    "",
    plan.package.chapter.summary ?? "(unchanged)",
    "",
    "Chapter links:",
    "",
    `- characters: ${plan.outline_links.characters.join(", ") || "none"}`,
    `- timeline_events: ${plan.outline_links.timeline_events.join(", ") || "none"}`,
    `- hooks: ${plan.outline_links.hooks.join(", ") || "none"}`,
    "",
  ].join("\n");
}

function assetSyncExistingUpdatePendingText(plan: AssetSyncPlan): string {
  return [
    "",
    "## Asset Update Candidates",
    "",
    "- status: pending",
    "- reason: asset_sync_existing_asset_update",
    "- user_confirmation_required: true",
    "",
    ...plan.existing_characters.flatMap((item) => [
      `### Character: ${item.name} (${item.id})`,
      "",
      item.current_state ? `- current_state: ${item.current_state}` : "- current_state: (unspecified)",
      item.traits.length > 0 ? `- traits: ${item.traits.join(", ")}` : "- traits: (unspecified)",
      "",
    ]),
    ...plan.existing_timeline_events.flatMap((item) => [
      `### Timeline Event: ${item.title} (${item.id})`,
      "",
      item.summary ? `- summary: ${item.summary}` : "- summary: (unspecified)",
      "",
    ]),
    ...plan.existing_hooks.flatMap((item) => [
      `### Hook: ${item.title} (${item.id})`,
      "",
      item.status ? `- status: ${item.status}` : "- status: (unspecified)",
      item.summary ? `- summary: ${item.summary}` : "- summary: (unspecified)",
      "",
    ]),
  ].join("\n");
}

function assetSyncCharactersMarkdown(characters: AssetSyncCharacter[]): string {
  return [
    "",
    "## Characters",
    "",
    ...characters.flatMap((character) => [
      `- id: ${character.id}`,
      `  name: ${character.name}`,
      character.role ? `  role: ${character.role}` : null,
      character.traits.length > 0 ? `  traits: ${character.traits.join("、")}` : null,
      character.current_state ? `  current_state: ${character.current_state}` : null,
      ...character.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function assetSyncTimelineMarkdown(events: AssetSyncTimelineEvent[]): string {
  return [
    "",
    "## Timeline",
    "",
    ...events.flatMap((event) => [
      `- id: ${event.id}`,
      `  event: ${event.title}`,
      event.summary ? `  summary: ${event.summary}` : null,
      ...event.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function assetSyncHooksMarkdown(hooks: AssetSyncHook[]): string {
  return [
    "",
    "## Hooks",
    "",
    ...hooks.flatMap((hook) => [
      `- id: ${hook.id}`,
      `  hook: ${hook.title}`,
      hook.status ? `  status: ${hook.status}` : null,
      hook.summary ? `  summary: ${hook.summary}` : null,
      ...hook.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function assetSyncSummary(plan: AssetSyncPlan): Record<string, number | boolean> {
  return {
    package_characters: plan.package.characters.length,
    package_timeline_events: plan.package.timeline_events.length,
    package_hooks: plan.package.hooks.length,
    new_characters: plan.new_characters.length,
    new_timeline_events: plan.new_timeline_events.length,
    new_hooks: plan.new_hooks.length,
    existing_characters: plan.existing_characters.length,
    existing_timeline_events: plan.existing_timeline_events.length,
    existing_hooks: plan.existing_hooks.length,
    outline_modified: plan.outline_modified,
  };
}

function normalizeStyleReferencePath(relPath: string | undefined): string {
  if (!relPath?.trim()) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_REQUIRED",
      "openathor style analyze requires a reference path.",
      { exitCode: 2 },
    );
  }

  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "reference path");

  return safeRelPath;
}

function normalizeStyleProfileId(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (!/^[a-z][a-z0-9_-]{2,}$/i.test(candidate)) {
    throw new OpenAthorError(
      "OA_STYLE_PROFILE_INVALID",
      "Style profile id must start with a letter and contain only letters, numbers, underscores or dashes.",
      { exitCode: 2 },
    );
  }

  return candidate;
}

function normalizeStylePermission(value: string | undefined): string {
  const permission = value?.trim() || "user_owned_or_authorized";
  const allowed = new Set([
    "user_owned_or_authorized",
    "user_owned",
    "licensed",
    "public_domain",
    "unknown",
  ]);

  if (!allowed.has(permission)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_PERMISSION_INVALID",
      `Unsupported style reference permission ${permission}.`,
      {
        exitCode: 2,
        hints: ["Use user_owned_or_authorized, user_owned, licensed, public_domain, or unknown."],
      },
    );
  }

  return permission;
}

function normalizeStyleSourceType(value: string | undefined): string {
  const sourceType = value?.trim() || "user_provided";
  const allowed = new Set(["user_provided", "project_manuscript", "licensed_reference", "public_domain"]);

  if (!allowed.has(sourceType)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_SOURCE_INVALID",
      `Unsupported style reference source type ${sourceType}.`,
      {
        exitCode: 2,
        hints: ["Use user_provided, project_manuscript, licensed_reference, or public_domain."],
      },
    );
  }

  return sourceType;
}

function buildStyleProfile(
  id: string,
  name: string,
  referenceId: string,
  metrics: StyleMetrics,
): Record<string, unknown> {
  const traits = {
    sentence_length: metricBand(metrics.average_sentence_chars, 28, 55),
    paragraph_length: metricBand(metrics.average_paragraph_chars, 80, 180),
    dialogue_ratio: ratioBand(metrics.dialogue_ratio, 0.12, 0.32),
    pacing:
      metrics.average_sentence_chars <= 28 && metrics.average_paragraph_chars <= 120
        ? "brisk"
        : metrics.average_sentence_chars >= 55 || metrics.average_paragraph_chars >= 220
          ? "expansive"
          : "measured",
    imagery_density: metricBand(
      metrics.char_count > 0 ? (metrics.action_detail_hits * 1000) / metrics.char_count : 0,
      4,
      11,
    ),
    exposition_style:
      metrics.emotion_exposition_hits > metrics.action_detail_hits
        ? "explicit_emotion"
        : metrics.action_detail_hits > metrics.emotion_exposition_hits * 2
          ? "concrete_detail"
          : "balanced",
  };

  return {
    id,
    name,
    status: "pending",
    source: "user_reference",
    references: [referenceId],
    generated_by: "openathor_style_analyze",
    method: "deterministic_style_metric_scan",
    traits,
    metrics,
    do: styleAnalyzeDoRules(metrics),
    avoid: [
      "不要复制参考文本原句或专有表达",
      "不要把参考文本作者姓名当作可执行风格规则",
      "不要把 pending profile 当作 confirmed project style",
    ],
  };
}

function metricBand(value: number, lowMax: number, highMin: number): "low" | "medium" | "high" {
  if (value <= lowMax) {
    return "low";
  }
  if (value >= highMin) {
    return "high";
  }
  return "medium";
}

function ratioBand(value: number, lowMax: number, highMin: number): "low" | "medium" | "high" {
  if (value <= lowMax) {
    return "low";
  }
  if (value >= highMin) {
    return "high";
  }
  return "medium";
}

function styleAnalyzeDoRules(metrics: StyleMetrics): string[] {
  const rules = [];

  if (metrics.average_sentence_chars <= 28) {
    rules.push("保持短句和直接动作推进");
  } else if (metrics.average_sentence_chars >= 55) {
    rules.push("允许较长句承载观察和转折");
  } else {
    rules.push("保持中等句长和清晰节奏");
  }

  if (metrics.dialogue_ratio >= 0.32) {
    rules.push("保留对话推动信息变化");
  } else if (metrics.dialogue_ratio <= 0.12) {
    rules.push("优先使用叙述和场景动作推进");
  } else {
    rules.push("保持叙述与对话的均衡");
  }

  if (metrics.action_detail_hits >= metrics.emotion_exposition_hits) {
    rules.push("用动作、物件和场景细节承载情绪");
  } else {
    rules.push("控制直接情绪解释，保留必要心理说明");
  }

  return rules;
}

async function writeStyleAnalyzeFiles(
  projectRoot: string,
  profile: Record<string, unknown>,
  reference: Record<string, unknown>,
): Promise<void> {
  const profilesPath = path.join(projectRoot, "style/profiles.yaml");
  const referencesPath = path.join(projectRoot, "style/references.yaml");
  const profilesData = await readYamlObjectFile(profilesPath, { profiles: [] });
  const referencesData = await readYamlObjectFile(referencesPath, { references: [] });

  profilesData.profiles = replaceRecordById(asRecordArray(profilesData.profiles), profile);
  referencesData.references = replaceRecordById(asRecordArray(referencesData.references), reference);

  await writeYaml(projectRoot, "style/profiles.yaml", profilesData);
  await writeYaml(projectRoot, "style/references.yaml", referencesData);
}

async function readYamlObjectFile(
  filePath: string,
  fallback: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) {
    return fallback;
  }

  const parsed = parseYaml(await readFile(filePath, "utf8"));
  return isPlainRecord(parsed) ? parsed : fallback;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

function replaceRecordById(
  records: Array<Record<string, unknown>>,
  next: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const id = typeof next.id === "string" ? next.id : null;
  const filtered = id ? records.filter((record) => record.id !== id) : records;
  return [...filtered, next];
}

function styleMetrics(text: string): StyleMetrics {
  const body = text.replace(/^# .+$/gm, "").trim();
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const sentences = body
    .split(/[。！？!?]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const dialogueLines = lines.filter((line) => /^["“][^"”]+["”]/u.test(line));
  const charCount = [...body.replace(/\s+/g, "")].length;
  const paragraphChars = paragraphs.map((paragraph) => [...paragraph.replace(/\s+/g, "")].length);

  return {
    char_count: charCount,
    sentence_count: sentences.length,
    average_sentence_chars:
      sentences.length > 0 ? roundOne(charCount / sentences.length) : 0,
    dialogue_line_count: dialogueLines.length,
    dialogue_ratio: lines.length > 0 ? roundTwo(dialogueLines.length / lines.length) : 0,
    paragraph_count: paragraphs.length,
    average_paragraph_chars:
      paragraphChars.length > 0
        ? roundOne(paragraphChars.reduce((sum, value) => sum + value, 0) / paragraphChars.length)
        : 0,
    action_detail_hits: countPatternHits(
      body,
      /手套|证物袋|相机|放大镜|镊子|齿轮|钥匙|锁|金属|锈|雨|雾|光|声|触|记录|笔记|机械/g,
    ),
    emotion_exposition_hits: countPatternHits(
      body,
      /悲伤|痛苦|愤怒|害怕|恐惧|绝望|崩溃|激动|兴奋|开心|难过|内心|情绪/g,
    ),
  };
}

function extractStyleRules(text: string): {
  do: string[];
  avoid: string[];
} {
  const doRules = [];
  const avoidRules = [];
  let section: "do" | "avoid" | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^(###?\s*)?(do|应做|推荐|典型行为|语言特征|特点|写作风格|语言质感|物理细节优先)/i.test(line)) {
      section = "do";
      continue;
    }

    if (/^(###?\s*)?(avoid|避免|禁止|不要|禁忌|禁止元素)/i.test(line)) {
      section = "avoid";
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/u)?.[1]?.trim();
    if (!bullet || !section) {
      continue;
    }

    const cleaned = cleanStyleRule(bullet);
    if (!cleaned) {
      continue;
    }

    const bulletSection = styleRuleSectionFromBullet(bullet) ?? section;
    if (bulletSection === "do") {
      doRules.push(cleaned);
    } else {
      avoidRules.push(cleaned);
    }
  }

  return {
    do: uniqueLimited(doRules, 20),
    avoid: uniqueLimited(avoidRules, 20),
  };
}

function cleanStyleRule(value: string): string {
  const cleaned = value
    .replace(/^["“”']|["“”']$/g, "")
    .replace(/^[✅❌]\s*/u, "")
    .replace(/^(?:避免|禁止|不要|禁忌|avoid|must not)\s*[:：]\s*/iu, "")
    .replace(/^(?:do|应做|推荐)\s*[:：]\s*/iu, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(语言特征|典型行为|特点|感官偏好|思维模式|叙事距离|适用场景|视觉|听觉|气味|触觉|节奏)[:：]?$/u.test(cleaned)) {
    return "";
  }

  if (/^(id|name|status|source|references|profiles|traits|rules|sentence_rhythm|diction|exposition_style)[:：]/iu.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function styleRuleSectionFromBullet(value: string): "do" | "avoid" | null {
  if (/^[❌]/u.test(value) || /(?:避免|禁止|不要|禁忌|avoid|must not)/iu.test(value)) {
    return "avoid";
  }
  if (/^[✅]/u.test(value) || /(?:应做|推荐|do)\s*[:：]/iu.test(value)) {
    return "do";
  }

  return null;
}

function styleRuleMatches(
  text: string,
  rules: {
    do: string[];
    avoid: string[];
  },
  maxChars: number,
): {
  do_hits: Array<{ rule: string; matched_terms: string[]; snippet: string }>;
  avoid_hits: Array<{ rule: string; matched_terms: string[]; snippet: string }>;
  do_misses: string[];
} {
  return {
    do_hits: styleRuleHits(text, rules.do, maxChars),
    avoid_hits: styleRuleHits(text, rules.avoid, maxChars),
    do_misses: rules.do
      .filter((rule) => !styleRuleHasHit(text, rule))
      .slice(0, 10),
  };
}

function styleRuleHits(
  text: string,
  rules: string[],
  maxChars: number,
): Array<{ rule: string; matched_terms: string[]; snippet: string }> {
  const hits = [];
  const normalized = text.toLowerCase();

  for (const rule of rules) {
    const terms = extractStyleRuleTerms(rule);
    const matchedTerms = terms.filter((term) => normalized.includes(term.toLowerCase()));
    if (matchedTerms.length === 0) {
      continue;
    }

    const firstTerm = matchedTerms[0];
    const index = Math.max(0, normalized.indexOf(firstTerm.toLowerCase()));
    hits.push({
      rule,
      matched_terms: matchedTerms.slice(0, 6),
      snippet: snippetAround(text.replace(/\s+/g, " "), index, firstTerm.length, maxChars),
    });
  }

  return hits.slice(0, 12);
}

function styleRuleHasHit(text: string, rule: string): boolean {
  const normalized = text.toLowerCase();
  return extractStyleRuleTerms(rule).some((term) =>
    normalized.includes(term.toLowerCase()),
  );
}

function extractStyleRuleTerms(rule: string): string[] {
  const terms = new Set<string>();
  const normalized = rule.toLowerCase();

  for (const token of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!STYLE_RULE_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  for (const token of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    if (!STYLE_RULE_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  return [...terms].slice(0, 12);
}

function styleDriftFindings(
  target: StyleMetrics,
  baseline: StyleMetrics | null,
  ruleMatches: ReturnType<typeof styleRuleMatches>,
): Array<{
  code: string;
  severity: "low" | "medium";
  message: string;
  evidence: Record<string, unknown>;
}> {
  const findings = [];

  if (baseline && baseline.average_sentence_chars > 0) {
    const ratio = target.average_sentence_chars / baseline.average_sentence_chars;
    if (ratio >= 1.8 || ratio <= 0.45) {
      findings.push({
        code: "style_sentence_length_shift",
        severity: "medium" as const,
        message: "Average sentence length differs sharply from the project baseline.",
        evidence: {
          target_average_sentence_chars: target.average_sentence_chars,
          baseline_average_sentence_chars: baseline.average_sentence_chars,
        },
      });
    } else if (ratio >= 1.45 || ratio <= 0.65) {
      findings.push({
        code: "style_sentence_length_review",
        severity: "low" as const,
        message: "Average sentence length differs from the project baseline.",
        evidence: {
          target_average_sentence_chars: target.average_sentence_chars,
          baseline_average_sentence_chars: baseline.average_sentence_chars,
        },
      });
    }
  }

  if (baseline && Math.abs(target.dialogue_ratio - baseline.dialogue_ratio) >= 0.35) {
    findings.push({
      code: "style_dialogue_ratio_shift",
      severity: "low" as const,
      message: "Dialogue line ratio differs from the project baseline.",
      evidence: {
        target_dialogue_ratio: target.dialogue_ratio,
        baseline_dialogue_ratio: baseline.dialogue_ratio,
      },
    });
  }

  if (target.emotion_exposition_hits > target.action_detail_hits && target.char_count > 200) {
    findings.push({
      code: "style_emotion_exposition_review",
      severity: "low" as const,
      message: "Emotion exposition terms outnumber concrete action/detail terms.",
      evidence: {
        emotion_exposition_hits: target.emotion_exposition_hits,
        action_detail_hits: target.action_detail_hits,
      },
    });
  }

  if (ruleMatches.avoid_hits.length > 0) {
    findings.push({
      code: "style_avoid_rule_hit",
      severity: "medium" as const,
      message: "The target chapter matches avoid-rule terms from project style guidance.",
      evidence: {
        avoid_hit_count: ruleMatches.avoid_hits.length,
        rules: ruleMatches.avoid_hits.slice(0, 5).map((hit) => hit.rule),
      },
    });
  }

  return findings;
}

function countPatternHits(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function uniqueLimited(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}

async function searchCandidatePaths(
  projectRoot: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
): Promise<string[]> {
  const candidates = new Set<string>();

  for (const chapter of inspection.manuscriptIndex.chapters) {
    candidates.add(chapter.source_path);
  }

  for (const relPath of [
    "bible/canon.md",
    "bible/canon.pending.md",
    "bible/style.md",
    "outline/chapters.yaml",
    "outline/scenes.yaml",
    "outline/volumes.yaml",
  ]) {
    candidates.add(relPath);
  }

  for (const dir of [inspection.config.paths.notes, inspection.config.paths.reviews]) {
    for (const relPath of await listTextFiles(projectRoot, dir)) {
      candidates.add(relPath);
    }
  }

  for (const relPath of await listProjectTextFiles(projectRoot)) {
    candidates.add(relPath);
  }

  const existing = [];
  for (const relPath of candidates) {
    if (isSafeRelativePath(relPath) && (await pathExists(path.join(projectRoot, relPath)))) {
      existing.push(relPath);
    }
  }

  return existing.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

async function buildVectorIndex(
  projectRoot: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
): Promise<VectorIndex> {
  const documents: VectorIndexDocument[] = [];
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const indexedBySource = new Map(
    inspection.manuscriptIndex.chapters.map((chapter) => [chapter.source_path, chapter]),
  );

  for (const relPath of relPaths) {
    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const terms = extractSearchTerms(text);

    if (terms.length === 0) {
      continue;
    }

    const indexedChapter = indexedBySource.get(relPath);
    documents.push({
      path: relPath,
      hash: await sha256File(fullPath),
      kind: indexedChapter ? "chapter" : vectorDocumentKind(relPath),
      title: indexedChapter?.title ?? firstMarkdownHeading(text),
      terms: terms.slice(0, 40),
      vector: deterministicEmbedding(terms),
      preview: snippetAround(text.replace(/\s+/g, " ").trim(), 0, 0, 360),
    });
  }

  return {
    schema_version: "openathor.vector_index.v1",
    generated_at: new Date().toISOString(),
    method: "deterministic_hash_embedding_v1",
    dimensions: VECTOR_DIMENSIONS,
    documents,
  };
}

function vectorDocumentKind(relPath: string): string {
  if (relPath.startsWith("bible/")) {
    return "bible";
  }
  if (relPath.startsWith("outline/")) {
    return "outline";
  }
  if (relPath.startsWith("notes/")) {
    return "note";
  }
  if (relPath.startsWith("style/")) {
    return "style";
  }
  if (relPath.startsWith("reviews/")) {
    return "review";
  }
  return "text";
}

async function listProjectTextFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (SYSTEM_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isSearchableTextPath(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(projectRoot);
  return files;
}

async function listTextFiles(projectRoot: string, relDir: string): Promise<string[]> {
  const root = path.join(projectRoot, relDir);
  const files: string[] = [];

  if (!(await pathExists(root))) {
    return files;
  }

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isSearchableTextPath(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(root);
  return files;
}

function isSearchableTextPath(relPath: string): boolean {
  return (
    isTextCandidate(relPath) ||
    relPath.endsWith(".yaml") ||
    relPath.endsWith(".yml") ||
    relPath.endsWith(".json")
  );
}

function findTextMatches(
  text: string,
  query: string,
  maxChars: number,
): Array<{
  line: number;
  column: number;
  snippet: string;
}> {
  const lowerQuery = query.toLowerCase();
  const matches = [];
  let offset = 0;

  for (const lineText of text.split(/\r?\n/)) {
    const index = lineText.toLowerCase().indexOf(lowerQuery);
    if (index >= 0) {
      matches.push({
        line: offset + 1,
        column: index + 1,
        snippet: snippetAround(lineText, index, query.length, maxChars),
      });
    }

    offset += 1;
  }

  return matches;
}

function extractSearchTerms(text: string): string[] {
  const terms = new Map<string, number>();
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9_]{3,}/g) ?? [];
  const cjk = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];

  for (const token of [...latin, ...cjk.flatMap(cjkNgrams)]) {
    if (SEARCH_STOP_WORDS.has(token)) {
      continue;
    }

    terms.set(token, (terms.get(token) ?? 0) + 1);
  }

  return [...terms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, 80)
    .map(([term]) => term);
}

function cjkNgrams(value: string): string[] {
  const result = new Set<string>();
  const chars = [...value];

  for (let size = 2; size <= Math.min(4, chars.length); size += 1) {
    for (let index = 0; index <= chars.length - size; index += 1) {
      result.add(chars.slice(index, index + size).join(""));
    }
  }

  return [...result];
}

function relatedScore(
  text: string,
  targetTerms: string[],
  maxChars: number,
): {
  score: number;
  sharedTerms: string[];
  snippet: string;
} {
  const normalized = text.toLowerCase();
  const sharedTerms = targetTerms.filter((term) => normalized.includes(term)).slice(0, 12);

  if (sharedTerms.length === 0) {
    return {
      score: 0,
      sharedTerms: [],
      snippet: "",
    };
  }

  const firstTerm = sharedTerms[0];
  const index = normalized.indexOf(firstTerm);

  return {
    score: sharedTerms.length,
    sharedTerms,
    snippet: snippetAround(text.replace(/\s+/g, " "), Math.max(0, index), firstTerm.length, maxChars),
  };
}

const VECTOR_DIMENSIONS = 64;

function deterministicEmbedding(terms: string[]): number[] {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);

  for (const term of terms) {
    const hash = createHash("sha256").update(term).digest();
    const index = hash[0] % VECTOR_DIMENSIONS;
    const sign = hash[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }

  return Number(Math.max(0, dot).toFixed(6));
}

const SEARCH_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "一个",
  "没有",
  "这里",
  "那里",
  "他们",
  "她们",
  "我们",
  "你们",
  "正在",
]);

const STYLE_RULE_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  "使用",
  "保持",
  "避免",
  "不要",
  "可以",
  "作为",
  "通过",
  "体现",
  "描写",
  "语言",
  "特征",
  "特点",
  "叙事",
  "风格",
  "项目",
]);

function snippetAround(
  lineText: string,
  index: number,
  queryLength: number,
  maxChars: number,
): string {
  if (lineText.length <= maxChars) {
    return lineText;
  }

  const half = Math.floor((maxChars - queryLength) / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(lineText.length, start + maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < lineText.length ? "..." : "";
  return `${prefix}${lineText.slice(start, end)}${suffix}`;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit) || !limit || limit < 1) {
    return fallback;
  }

  return Math.min(Math.floor(limit), 100);
}

function normalizeSnippetChars(maxChars: number | undefined): number {
  if (!Number.isFinite(maxChars) || !maxChars || maxChars < 40) {
    return 180;
  }

  return Math.min(Math.floor(maxChars), 1000);
}

function resolveContextChapter(
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

function contextWindow(chapters: IndexedChapter[], targetOrder: number): IndexedChapter[] {
  return chapters
    .filter((chapter) => Math.abs(chapter.display_order - targetOrder) <= 1)
    .sort((a, b) => a.display_order - b.display_order);
}

function truncateText(text: string, maxChars: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
  };
}

function normalizeMaxChars(maxChars: number | undefined): {
  section: number;
  note: number;
  targetChapter: number;
  neighborChapter: number;
} {
  const base = Number.isFinite(maxChars) && maxChars && maxChars > 500 ? maxChars : 6000;

  return {
    section: Math.max(500, Math.floor(base / 3)),
    note: Math.max(300, Math.floor(base / 5)),
    targetChapter: base,
    neighborChapter: Math.max(500, Math.floor(base / 2)),
  };
}

function nextDisplayOrder(index: ManuscriptIndex): number {
  const currentMax = index.chapters.reduce(
    (max, chapter) => Math.max(max, chapter.display_order),
    0,
  );
  return currentMax + 1;
}

function uniqueNewChapterId(order: number, index: ManuscriptIndex): string {
  const existing = new Set(index.chapters.map((chapter) => chapter.id));
  let candidate = `ch_${String(order).padStart(3, "0")}`;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `ch_${String(order).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function uniqueNewOutlineChapterId(
  order: number,
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
): string {
  const existing = new Set([
    ...chapters.chapters.map((chapter) => chapter.id),
    ...manuscriptIndex.chapters.map((chapter) => chapter.id),
  ]);
  let candidate = `ch_${String(order).padStart(3, "0")}`;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `ch_${String(order).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function firstMarkdownHeading(text: string): string | null {
  const heading = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  return heading ? heading.replace(/^#\s+/, "").trim() || null : null;
}

function titleFromTask(task: string): string | null {
  const bookTitle = task.match(/《([^》]+)》/u)?.[1]?.trim();
  if (bookTitle) {
    return bookTitle;
  }

  const quotedTitle = task.match(/["“”]([^"“”]+)["“”]/u)?.[1]?.trim();
  return quotedTitle || null;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function defaultMarkdownExportPath(config: ProjectConfig): string {
  const filename = `${slugAscii(config.project.title) || "manuscript"}.md`;
  return `exports/${filename}`;
}

function skeletonWrites(reason: string): EnvelopeWrite[] {
  return [
    "openathor.yaml",
    "bible/",
    "outline/",
    "outline/volumes.yaml",
    "outline/chapters.yaml",
    "outline/scenes.yaml",
    "manuscript/",
    "notes/",
    "style/",
    "style/samples/",
    ...STANDARD_ASSET_FILES,
    "reviews/",
    "runs/",
    ".openathor/",
    ".openathor/manuscript.index.yaml",
  ].map((relPath) => ({
    path: relPath,
    change_type: "created" as const,
    reason,
  }));
}

function adoptWrites(): EnvelopeWrite[] {
  return [
    ...skeletonWrites("adopt_project_skeleton"),
    {
      path: ".openathor/import-report.md",
      change_type: "created" as const,
      reason: "adopt_import_report",
    },
    {
      path: "runs/run_*.json",
      change_type: "created" as const,
      reason: "adopt_run_record",
    },
  ];
}

async function scanUserFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (SYSTEM_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(root, fullPath));
      if (isTextCandidate(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(root);
  return files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function classifyFile(relPath: string): ClassifiedFile {
  const normalized = relPath.toLowerCase();
  const basename = path.posix.basename(relPath, path.posix.extname(relPath));
  const parsed = parseChapterOrder(basename);
  const inManuscriptDir =
    normalized.includes("正文/") ||
    normalized.includes("manuscript/") ||
    normalized.includes("chapter") ||
    normalized.includes("chapters/");

  if (parsed.order !== null || inManuscriptDir) {
    return {
      path: relPath,
      kind: "chapter",
      title: parsed.title || basename,
      order: parsed.order,
      reason: parsed.order === null ? "chapter path without stable numeric order" : "chapter",
    };
  }

  if (
    normalized.includes("设定") ||
    normalized.includes("人物") ||
    normalized.includes("世界观") ||
    normalized.includes("bible") ||
    normalized.includes("setting") ||
    normalized.includes("notes/")
  ) {
    return {
      path: relPath,
      kind: "note",
      title: basename,
      order: null,
      reason: "project note or setting",
    };
  }

  if (normalized.includes("风格") || normalized.includes("style")) {
    return {
      path: relPath,
      kind: "style_reference",
      title: basename,
      order: null,
      reason: "style reference candidate",
    };
  }

  if (
    normalized.includes("废稿") ||
    normalized.includes("scrap") ||
    normalized.includes("trash") ||
    normalized.includes("discard")
  ) {
    return {
      path: relPath,
      kind: "scrap",
      title: basename,
      order: null,
      reason: "scrap draft must not become confirmed canon",
    };
  }

  return {
    path: relPath,
    kind: "unclassified",
    title: basename,
    order: null,
    reason: "unclassified text file",
  };
}

function parseChapterOrder(basename: string): { order: number | null; title: string } {
  const arabic = basename.match(/^(?:ch(?:apter)?[-_ ]*)?0*(\d{1,4})(?:[-_. ]+)?(.*)$/i);
  if (arabic) {
    return {
      order: Number(arabic[1]),
      title: stripTitle(arabic[2] || basename),
    };
  }

  const chinese = basename.match(/^第\s*([一二三四五六七八九十百千万两0-9]+)\s*[章节回]\s*(.*)$/);
  if (chinese) {
    return {
      order: parseChineseNumber(chinese[1]),
      title: stripTitle(chinese[2] || basename),
    };
  }

  return { order: null, title: stripTitle(basename) };
}

function duplicateNumericOrders(chapters: ClassifiedFile[]): Set<number> {
  const seen = new Set<number>();
  const duplicated = new Set<number>();

  for (const chapter of chapters) {
    if (chapter.order === null) {
      continue;
    }

    if (seen.has(chapter.order)) {
      duplicated.add(chapter.order);
    }

    seen.add(chapter.order);
  }

  return duplicated;
}

function buildAdoptQuestions(
  chapters: ClassifiedFile[],
  duplicateOrders: Set<number>,
  scraps: ClassifiedFile[],
  unclassified: ClassifiedFile[],
): ManuscriptIndex["questions"] {
  const questions: NonNullable<ManuscriptIndex["questions"]> = [];

  for (const chapter of chapters) {
    if (chapter.order === null) {
      questions.push({
        id: `confirm_order_${shortHash(chapter.path)}`,
        path: chapter.path,
        question: "Confirm this chapter's display order.",
        reason: "No stable chapter number was detected.",
      });
    } else if (duplicateOrders.has(chapter.order)) {
      questions.push({
        id: `dedupe_order_${shortHash(chapter.path)}`,
        path: chapter.path,
        question: `Resolve duplicate chapter order ${chapter.order}.`,
        reason: "Two or more files share the same detected chapter number.",
      });
    }
  }

  for (const file of [...scraps, ...unclassified]) {
    questions.push({
      id: `classify_${shortHash(file.path)}`,
      path: file.path,
      question: "Confirm whether this file should be imported, ignored, or archived.",
      reason: file.reason,
    });
  }

  return questions;
}

async function buildIndexedChapters(
  root: string,
  chapters: ClassifiedFile[],
  duplicateOrders: Set<number>,
): Promise<IndexedChapter[]> {
  const sorted = [...chapters].sort((a, b) => {
    if (a.order !== null && b.order !== null && a.order !== b.order) {
      return a.order - b.order;
    }

    if (a.order !== null && b.order === null) {
      return -1;
    }

    if (a.order === null && b.order !== null) {
      return 1;
    }

    return a.path.localeCompare(b.path, "zh-Hans-CN");
  });

  const usedIds = new Set<string>();
  const result: IndexedChapter[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const chapter = sorted[index];
    const displayOrder = index + 1;
    const id = uniqueChapterId(chapter, displayOrder, usedIds);
    const confidence =
      chapter.order === null || duplicateOrders.has(chapter.order) ? "low" : "high";

    usedIds.add(id);
    result.push({
      id,
      display_order: displayOrder,
      title: chapter.title,
      source_path: chapter.path,
      status: "existing",
      origin: "adopted",
      content_hash: await sha256File(path.join(root, chapter.path)),
      detected_title: chapter.title,
      confidence,
    });
  }

  return result;
}

function uniqueChapterId(
  chapter: ClassifiedFile,
  displayOrder: number,
  usedIds: Set<string>,
): string {
  const orderPart = String(chapter.order ?? displayOrder).padStart(3, "0");
  const titlePart = slugAscii(chapter.title) || shortHash(chapter.path);
  let candidate = `ch_${orderPart}_${titlePart}`;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `ch_${orderPart}_${titlePart}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function findProjectRoot(start: string): Promise<string> {
  let current = start;

  while (true) {
    if (await pathExists(path.join(current, "openathor.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new OpenAthorError(
        "OA_PROJECT_NOT_FOUND",
        "No openathor.yaml found in the current directory or its parents.",
        { exitCode: 2 },
      );
    }

    current = parent;
  }
}

async function hashSources(root: string, relPaths: string[]): Promise<EnvelopeSource[]> {
  const unique = [...new Set(relPaths.map((relPath) => toPosix(relPath)))];
  const sources: EnvelopeSource[] = [];

  for (const relPath of unique) {
    if (!isSafeRelativePath(relPath)) {
      continue;
    }

    const fullPath = path.join(root, relPath);
    if (await pathExists(fullPath)) {
      sources.push({
        path: relPath,
        hash: await sha256File(fullPath),
      });
    }
  }

  return sources;
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function hasEntries(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function writeYaml(root: string, relPath: string, data: unknown): Promise<void> {
  await writeText(root, relPath, stringifyYaml(data));
}

async function writeText(root: string, relPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
  await writeFile(path.join(root, relPath), text, "utf8");
}

async function appendText(root: string, relPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
  const filePath = path.join(root, relPath);
  const existing = (await pathExists(filePath)) ? await readFile(filePath, "utf8") : "";
  await writeFile(filePath, `${existing}${existing.endsWith("\n") ? "" : "\n"}${text}`, "utf8");
}

function proposalNeedsChapter(kind: WritingProposalKind): boolean {
  return kind === "draft" || kind === "review" || kind === "revise";
}

function proposalCommandName(kind: WritingProposalKind): string {
  if (kind === "canon_sync") {
    return "openathor canon sync";
  }

  return `openathor ${kind}`;
}

function proposalPath(
  kind: WritingProposalKind,
  stamp: string,
  target: { id: string; display_order: number; title: string; source_path: string } | null,
): string {
  const targetPart = target ? `${target.id}_` : "";

  if (kind === "plan") {
    return `notes/plan-${targetPart}${stamp}.md`;
  }

  if (kind === "draft") {
    return `notes/draft-${targetPart}${stamp}.md`;
  }

  if (kind === "review") {
    return `reviews/review-${targetPart}${stamp}.md`;
  }

  if (kind === "revise") {
    return `reviews/revise-${targetPart}${stamp}.md`;
  }

  return "bible/canon.pending.md";
}

function proposalMarkdown(
  kind: WritingProposalKind,
  task: string,
  stamp: string,
  target: { id: string; display_order: number; title: string; source_path: string } | null,
): string {
  return [
    `# ${proposalTitle(kind)}`,
    "",
    `- run: ${stamp}`,
    `- mode: proposal`,
    `- target: ${target ? `${target.id} (${target.title})` : "project"}`,
    `- source_path: ${target?.source_path ?? ""}`,
    `- user_confirmation_required: true`,
    "",
    "## User Task",
    "",
    task,
    "",
    "## Agent Instructions",
    "",
    proposalNextAction(kind),
    "",
  ].join("\n");
}

function canonPendingProposalText(
  task: string,
  stamp: string,
  target: { id: string; display_order: number; title: string; source_path: string } | null,
): string {
  return [
    "",
    `## pending_${stamp}: Canon Sync Proposal`,
    "",
    "- status: pending",
    `- source_ref: ${target?.id ?? "project"}`,
    `- source: ${target?.source_path ?? "context"}`,
    "- user_confirmation_required: true",
    "",
    "Task:",
    "",
    task,
    "",
  ].join("\n");
}

function proposalTitle(kind: WritingProposalKind): string {
  if (kind === "plan") {
    return "Plan Proposal";
  }

  if (kind === "draft") {
    return "Draft Task Package";
  }

  if (kind === "review") {
    return "Review Notes";
  }

  if (kind === "revise") {
    return "Revision Proposal";
  }

  return "Canon Sync Proposal";
}

function proposalNextAction(kind: WritingProposalKind): string {
  if (kind === "plan") {
    return "Use the context pack to propose outline or scene-level next steps for user confirmation.";
  }

  if (kind === "draft") {
    return "Use the context pack to draft text in the conversation or prepare a diff only after user confirmation.";
  }

  if (kind === "review") {
    return "Fill this review with prioritized issues grounded in the context pack and manuscript source.";
  }

  if (kind === "revise") {
    return "Prepare a local diff proposal; do not rewrite manuscript files without explicit user confirmation.";
  }

  return "Extract candidate facts into pending canon only; do not modify confirmed canon without user confirmation.";
}

function detectCanonConflicts(contextData: unknown, task: string): CanonConflict[] {
  const confirmed = readNestedRecord(contextData, ["canon", "confirmed"]);
  const text = typeof confirmed?.text === "string" ? confirmed.text : "";
  const source = typeof confirmed?.path === "string" ? confirmed.path : "bible/canon.md";
  const rules = confirmedCanonRules(text);
  const conflicts: CanonConflict[] = [];

  for (const rule of rules) {
    const matchedTerms = rule.terms.filter((term) => task.includes(term));
    if (matchedTerms.length === 0) {
      continue;
    }

    conflicts.push({
      canon_id: rule.id,
      source,
      statement: rule.statement,
      user_request: task,
      matched_terms: matchedTerms,
    });
  }

  return conflicts;
}

function confirmedCanonRules(text: string): Array<{
  id: string | null;
  statement: string;
  terms: string[];
}> {
  const rules = [];
  let currentId: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingId = line.match(/^#+\s+([a-z0-9_]+)\b/i)?.[1] ?? null;
    if (headingId) {
      currentId = headingId;
    }

    if (!isConstraintLine(line)) {
      continue;
    }

    const terms = conflictTerms(line);
    if (terms.length === 0) {
      continue;
    }

    rules.push({
      id: currentId,
      statement: line.replace(/^[-*0-9.\s]+/, "").trim(),
      terms,
    });
  }

  return rules;
}

function isConstraintLine(line: string): boolean {
  return /禁忌|禁止|不能|不可|绝不可|不得|规则|avoid|must not|forbid/i.test(line);
}

function conflictTerms(line: string): string[] {
  const terms = new Set<string>();
  const normalized = line.toLowerCase();
  const domainTerms = [
    "通灵",
    "预知",
    "超自然",
    "鬼魂",
    "灵异",
    "客轮",
    "电子密钥",
    "电子钥匙",
    "尖叫",
    "无助",
    "机械一窍不通",
  ];

  for (const term of domainTerms) {
    if (normalized.includes(term.toLowerCase())) {
      terms.add(term);
    }
  }

  return [...terms];
}

function readNestedRecord(
  value: unknown,
  pathParts: string[],
): Record<string, unknown> | null {
  let current = value;

  for (const part of pathParts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "object" && current !== null
    ? (current as Record<string, unknown>)
    : null;
}

function isTextCandidate(relPath: string): boolean {
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".txt";
}

function stableProjectId(title: string): string {
  return slugAscii(title) || `project_${shortHash(title)}`;
}

function slugAscii(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function stripTitle(value: string): string {
  return value.replace(/^[-_.\s]+/, "").trim();
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function runStamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function osHome(): string {
  const home = process.env.HOME || process.env.USERPROFILE;

  if (!home) {
    throw new OpenAthorError(
      "OA_WRITE_PERMISSION_DENIED",
      "Cannot resolve the user home directory for global Pi Skill installation.",
      { exitCode: 2 },
    );
  }

  return home;
}

function parseChineseNumber(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const digitByChar: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (value === "十") {
    return 10;
  }

  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex);
    const right = value.slice(tenIndex + 1);
    const tens = left ? digitByChar[left] ?? 1 : 1;
    const ones = right ? digitByChar[right] ?? 0 : 0;
    return tens * 10 + ones;
  }

  return digitByChar[value] ?? 0;
}
