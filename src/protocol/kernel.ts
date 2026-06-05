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
};

type SkillInstallOptions = {
  cwd?: string;
  target?: "project" | "global";
  dryRun?: boolean;
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

type OutlineSplitOptions = {
  cwd?: string;
  target?: string;
  atLine?: number;
  titleBefore?: string;
  titleAfter?: string;
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
  "reviews",
  "runs",
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
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: false });
  const sqliteRel = inspection.config.paths.sqlite_index;
  const sqlitePath = path.join(projectRoot, sqliteRel);
  const writes: EnvelopeWrite[] = [
    {
      path: sqliteRel,
      change_type: (await pathExists(sqlitePath)) ? "replaced" : "created",
      reason: "derived_index_rebuild",
    },
  ];

  if (!dryRun) {
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    await rm(sqlitePath, { force: true });
    await writeSqliteIndex(sqlitePath, inspection);
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : writes,
    data: {
      dry_run: dryRun,
      planned_writes: dryRun ? writes : [],
      chapters_indexed: inspection.manuscriptIndex.chapters.length,
      sqlite_index: sqliteRel,
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
  const splitPlan = outlineSplitPlan(
    targetSource.text,
    splitAtLine,
    titleBefore,
    titleAfter,
    maxChars,
  );
  const plannedWrites = splitWrites(target);

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: splitSources(
      inspection.sources,
      target.source_path,
      targetSource.hash,
    ),
    writes: [],
    warnings: inspection.warnings,
    data: {
      dry_run: options.dryRun ?? false,
      mode: options.diff ? "diff" : "proposal",
      command: "openathor outline split",
      target: outlineTargetData(target, targetSource.hash),
      split_at_line: splitPlan.split_at_line,
      line_count: splitPlan.line_count,
      before: splitPlan.before,
      after: splitPlan.after,
      result: splitResult(splitPlan, false),
      user_confirmation_required: true,
      confirmed_write_supported: false,
      planned_writes: plannedWrites,
      diff: splitDiff(target, splitPlan),
      next_agent_action:
        "Show the split proposal to the user. Confirmed split writes are not implemented yet, so do not modify manuscript, outline, or index files automatically.",
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

function outlineSplitPlan(
  text: string,
  splitAtLine: number,
  titleBefore: string,
  titleAfter: string,
  maxChars: number,
): OutlineSplitPlan {
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
  };
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
  manuscript_file_modified: false;
  manuscript_files_created: false;
  outline_modified: false;
  index_modified: false;
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
    manuscript_file_modified: false,
    manuscript_files_created: false,
    outline_modified: false,
    index_modified: false,
  };
}

function splitWrites(target: ResolvedOutlineChapter): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "future_outline_split_metadata",
    },
  ];

  if (target.indexedChapter) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "future_outline_split_index",
    });
  }

  if (target.source_path) {
    writes.push({
      path: target.source_path,
      change_type: "modified",
      reason: "future_outline_split_manuscript_source",
    });
  }

  return writes;
}

function splitDiff(
  target: ResolvedOutlineChapter,
  splitPlan: OutlineSplitPlan,
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
        path: ".openathor/manuscript.index.yaml",
        field: `chapters[${target.id}].source_split`,
        from: null,
        to: splitPlan.after.line_start,
      },
    ],
  };
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

  await mkdir(path.join(projectRoot, ".openathor"), { recursive: true });

  await writeYaml(projectRoot, "openathor.yaml", config);
  await writeText(projectRoot, "bible/premise.md", "# Premise\n\n");
  await writeText(projectRoot, "bible/style.md", "# Style\n\n");
  await writeText(projectRoot, "bible/canon.md", "# Confirmed Canon\n\n");
  await writeText(projectRoot, "bible/canon.pending.md", "# Pending Canon\n\n");
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
    ...manuscriptIndex.chapters.map((chapter) => chapter.source_path),
  ]);

  const warnings: EnvelopeWarning[] = [];
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
      derived_index_current: warnings.length === 0,
    },
  };
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

function skeletonWrites(reason: string): EnvelopeWrite[] {
  return [
    "openathor.yaml",
    "bible/",
    "bible/premise.md",
    "bible/style.md",
    "bible/canon.md",
    "bible/canon.pending.md",
    "outline/",
    "outline/volumes.yaml",
    "outline/chapters.yaml",
    "outline/scenes.yaml",
    "manuscript/",
    "notes/",
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
      path: "notes/import-questions.md",
      change_type: "created" as const,
      reason: "adopt_questions",
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
