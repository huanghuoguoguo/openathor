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
import {
  buildAdoptQuestions,
  buildIndexedChapters,
  classifyFile,
  duplicateNumericOrders,
  scanUserFiles,
} from "./adopt-files.js";
import {
  addLinkedAssetRef,
  assetLookup,
  assetSummaryKey,
  extractMarkdownEntities,
  isSameAssetReference,
  stringLinks,
} from "./asset-markdown.js";
import {
  characterAssetProfileCoverage,
  summarizeAssetCoverage,
  summarizeCharacterProfileCoverage,
} from "./asset-coverage.js";
import type { AssetAuditSources } from "./asset-sources.js";
import {
  assetSyncPendingText,
  assetSyncSummary,
  assetSyncWrites,
  buildAssetSyncPlan,
  upsertAssetSyncCharactersMarkdown,
  upsertAssetSyncHooksMarkdown,
  upsertAssetSyncTimelineMarkdown,
} from "./asset-sync.js";
import { normalizeAssetSyncPackagePath, readAssetSyncPackage } from "./asset-sync-package.js";
import { detectCanonConflicts } from "./canon-conflict.js";
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
import {
  insertAffectedChapters,
  insertDiff,
  insertResult,
  insertSources,
  insertWrites,
  moveDiff,
  moveDisplayOrderChanges,
  moveResult,
  moveSources,
  moveWrites,
} from "./outline-order.js";
import {
  outlineTargetData,
  resolveOutlineTarget,
  uniqueNewOutlineChapterId,
} from "./outline-target.js";
import { readYamlFile, validateSchema } from "./schema.js";
import {
  archiveDiff,
  archiveResult,
  archiveSources,
  archiveWrites,
} from "./outline-archive.js";
import {
  mergeOutlineLinks,
  mergePlan,
  mergeProposalData,
  mergeWrites,
  mergedChapterText,
  mergedSummary,
} from "./outline-merge.js";
import { detectStyleReferenceCopy } from "./style-reference-copy.js";
import {
  buildOutlineReplanPlan,
  normalizeOutlineReplanPackagePath,
  readOutlineReplanPackage,
  replanConfirmedWrites,
  replanDiff,
  replanPackageDiff,
  replanResult,
  replanSources,
  replanWrites,
  validateConfirmedReplanSafe,
} from "./outline-replan.js";
import {
  normalizeSplitLine,
  outlineSplitParts,
  splitDisplayOrderById,
  splitProposalData,
  splitResult,
  splitSourcePath,
  splitSources,
  splitWrites,
} from "./outline-split.js";
import {
  STYLE_RULE_STOP_WORDS,
  VECTOR_DIMENSIONS,
  cosineSimilarity,
  deterministicEmbedding,
  extractSearchTerms,
  findTextMatches,
  normalizeLimit,
  normalizeSnippetChars,
  relatedScore,
  snippetAround,
} from "./text-analysis.js";
import { firstMarkdownHeading, titleFromTask } from "./title.js";
import { isPlainRecord, optionalString, stringArray, uniqueLimited } from "./value.js";
import { PI_SKILL_TEXT } from "../skills/pi-skill.js";
import {
  STANDARD_ASSET_DIRECTORIES,
  STANDARD_ASSET_FILES,
  REQUIRED_DIRECTORIES,
  adoptWrites,
  createProjectConfig,
  skeletonWrites,
} from "./project-layout.js";
import { shortHash, slugAscii } from "./identifiers.js";
import { isTextCandidate, SKIPPED_TEXT_SCAN_DIRS } from "./text-path.js";
import type {
  AdoptOptions,
  AssetSyncPlan,
  AssetsAuditOptions,
  AssetsSyncOptions,
  ChapterCharacterProfileCoverage,
  ChapterEntityCoverage,
  ChapterOutline,
  ChapterOutlineEntry,
  ClassifiedFile,
  CommandResult,
  ContextOptions,
  DoctorOptions,
  ExportOptions,
  IndexedChapter,
  IndexRebuildOptions,
  InitOptions,
  ManuscriptIndex,
  NotImplementedOptions,
  OutlineArchiveOptions,
  OutlineImpactOptions,
  OutlineInsertOptions,
  OutlineMergeOptions,
  OutlineMoveOptions,
  OutlineReplanOptions,
  OutlineShowOptions,
  OutlineSplitOptions,
  ProjectConfig,
  ResolvedOutlineChapter,
  SearchRelatedOptions,
  SearchSemanticOptions,
  SearchTextOptions,
  SkillInstallOptions,
  StyleAnalyzeOptions,
  StyleCheckOptions,
  StyleMetrics,
  StyleProfileApplyOptions,
  StyleProfileShowOptions,
  StyleReviseOptions,
  VectorIndex,
  VectorIndexDocument,
  WritingProposalKind,
  WritingProposalOptions,
} from "./model.js";

export type { CommandResult } from "./model.js";

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

export async function runStyleProfileApply(
  options: StyleProfileApplyOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const profileId = normalizeStyleProfileId(options.profileId, "style_main");
  const profilesRelPath = "style/profiles.yaml";
  const profilesPath = path.join(projectRoot, profilesRelPath);
  const profilesHash = (await pathExists(profilesPath)) ? await sha256File(profilesPath) : null;
  const profilesData = await readYamlObjectFile(profilesPath, { profiles: [] });
  const profiles = asRecordArray(profilesData.profiles);
  const profileIndex = profiles.findIndex((profile) => profile.id === profileId);

  if (profileIndex < 0) {
    throw new OpenAthorError(
      "OA_STYLE_PROFILE_NOT_FOUND",
      `Style profile not found: ${profileId}.`,
      { exitCode: 2 },
    );
  }

  const currentProfile = profiles[profileIndex];
  const updatedProfile = {
    ...currentProfile,
    status: "confirmed",
    active: true,
    confirmed_at: new Date().toISOString(),
  };
  const updatedProfiles = profiles.map((profile, index) => ({
    ...profile,
    ...(index === profileIndex
      ? updatedProfile
      : profile.status === "confirmed" || profile.active === true
        ? { active: false }
        : {}),
  }));
  const dryRun = options.dryRun ?? false;
  const diff = options.diff ?? false;
  const confirm = options.confirm ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_style_profile_apply.json`;
  const sources = [...inspection.sources]
    .filter((source) => ["style/profiles.yaml", "style/references.yaml", "bible/style.md"].includes(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (profilesHash && !sources.some((source) => source.path === profilesRelPath)) {
    sources.push({ path: profilesRelPath, hash: profilesHash });
  }
  const writes: EnvelopeWrite[] = [
    {
      path: profilesRelPath,
      change_type: "modified",
      reason: "style_profile_apply_confirmed",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "style_profile_apply_run_record",
    },
  ];
  const data = {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor style profile apply",
    profile_id: profileId,
    profile: updatedProfile,
    base_hash: options.baseHash ?? null,
    current_hash: profilesHash,
    user_confirmation_required: !confirm,
    planned_writes: previewOnly ? writes : [],
    diff: {
      summary: "Confirm one pending style profile as active project style; no manuscript text is changed.",
      changes: [
        {
          path: profilesRelPath,
          field: `profiles[${profileId}].status`,
          from: currentProfile.status ?? null,
          to: "confirmed",
        },
        {
          path: profilesRelPath,
          field: `profiles[${profileId}].active`,
          from: currentProfile.active ?? null,
          to: true,
        },
      ],
    },
    result: {
      applied: !previewOnly,
      profile_status: previewOnly ? currentProfile.status ?? null : "confirmed",
      active_profile_id: previewOnly ? null : profileId,
      manuscript_modified: false,
      reference_text_copied: false,
    },
    next_agent_action: previewOnly
      ? "Show this style profile confirmation to the user, then rerun with --confirm --base-hash after explicit approval."
      : "Run openathor style profile show --json and use the confirmed profile as project style guidance.",
  };

  if (previewOnly) {
    return {
      projectRoot,
      projectId: inspection.config.project.id,
      sources,
      writes: [],
      warnings: inspection.warnings,
      data,
    };
  }

  if (!options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed style profile apply requires --base-hash <sha256:...> for style/profiles.yaml.",
      { exitCode: 2 },
    );
  }

  if (profilesHash !== options.baseHash) {
    throw new OpenAthorError(
      "OA_STYLE_PROFILE_CHANGED",
      "Refusing to apply style profile because style/profiles.yaml changed.",
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${profilesHash ?? "missing"}.`,
          "Rerun openathor style profile show --json and ask the user to confirm the latest profile.",
        ],
      },
    );
  }

  await writeYaml(projectRoot, profilesRelPath, {
    ...profilesData,
    profiles: updatedProfiles,
  });
  await writeYaml(projectRoot, runRelPath, {
    agent_role: "openathor-cli",
    command: "openathor style profile apply",
    created_at: new Date().toISOString(),
    mode: "confirmed_write",
    profile_id: profileId,
    before_status: currentProfile.status ?? null,
    after_status: "confirmed",
    writes,
    sources,
    user_confirmation_required: false,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes,
    warnings: inspection.warnings,
    data: {
      ...data,
      mode: "confirmed_write",
      user_confirmation_required: false,
      planned_writes: [],
      result: {
        ...data.result,
        applied: true,
        profile_status: "confirmed",
        active_profile_id: profileId,
      },
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
        "Use openathor style revise chapter <target> --goal ... for style-specific proposal, diff, and hash-confirm workflow.",
        "Do not copy reference text phrasing when resolving style drift.",
      ],
    },
  };
}

export async function runStyleRevise(
  options: StyleReviseOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_STYLE_UNSUPPORTED_SCOPE",
      `Unsupported style revise scope ${options.scope}.`,
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
  const sourceRelPath = targetChapter.source_path;
  const sourceFullPath = path.join(projectRoot, sourceRelPath);
  const sourceHash = await sha256File(sourceFullPath);
  const currentText = await readFile(sourceFullPath, "utf8");
  const revisedText = options.text?.trim();
  const goal = options.goal?.trim() || "Revise the target chapter toward confirmed project style guidance.";
  const confirmWrite = options.confirmWrite ?? false;
  const dryRun = options.dryRun ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirmWrite;
  const proposalWrite = !confirmWrite && !diff && !dryRun;
  const maxChars = normalizeSnippetChars(options.maxChars);
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_style_revise.json`;
  const proposalRelPath = `reviews/style-revise-${targetChapter.id}-${stamp}.md`;
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }
  sourceMap.set(sourceRelPath, { path: sourceRelPath, hash: sourceHash });

  const styleCheck = await runStyleCheck({
    cwd: projectRoot,
    scope: "chapter",
    target: targetChapter.id,
    maxChars,
  });
  const profileState = await activeStyleProfileState(projectRoot, sourceMap);
  const referenceCopy = revisedText
    ? await detectStyleReferenceCopy(projectRoot, revisedText, sourceMap)
    : null;
  const sources = [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const writes: EnvelopeWrite[] = previewOnly
    ? [
        {
          path: proposalRelPath,
          change_type: "created",
          reason: "style_revision_proposal",
        },
        {
          path: runRelPath,
          change_type: "created",
          reason: "style_revision_run_record",
        },
      ]
    : [
        {
          path: sourceRelPath,
          change_type: "modified",
          reason: "confirmed_style_revision",
        },
        {
          path: "outline/chapters.yaml",
          change_type: "modified",
          reason: "confirmed_style_revision_outline",
        },
        {
          path: ".openathor/manuscript.index.yaml",
          change_type: "modified",
          reason: "confirmed_style_revision_index",
        },
        {
          path: runRelPath,
          change_type: "created",
          reason: "confirmed_style_revision_run_record",
        },
      ];

  if (!previewOnly && !revisedText) {
    throw new OpenAthorError(
      "OA_STYLE_REVISE_TEXT_REQUIRED",
      "Confirmed style revision writes require --text <manuscript text>.",
      { exitCode: 2 },
    );
  }

  if (!previewOnly && !options.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed style revision writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  if (!previewOnly && sourceHash !== options.baseHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to style-revise ${targetChapter.id} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${options.baseHash}.`,
          `Current ${sourceHash}.`,
          "Regenerate style revision from the latest chapter text before confirming.",
        ],
      },
    );
  }

  if (referenceCopy) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_TEXT_COPIED",
      "Refusing style revision because the supplied manuscript text appears to copy reference text.",
      {
        exitCode: 4,
        hints: [
          `Reference: ${referenceCopy.reference_path}.`,
          `Matched excerpt: ${referenceCopy.excerpt}.`,
          "Rewrite the passage using project-specific wording, then rerun style revise with the latest source hash.",
        ],
      },
    );
  }

  if (proposalWrite) {
    await writeText(
      projectRoot,
      proposalRelPath,
      styleReviseProposalMarkdown({
        goal,
        target: targetChapter,
        sourceHash,
        profileState,
        styleCheckData: styleCheck.data,
        revisedText,
      }),
    );
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor style revise",
      created_at: new Date().toISOString(),
      mode: diff ? "diff" : "proposal",
      goal,
      target: styleReviseTarget(targetChapter, sourceHash),
      profile: profileState.activeProfile,
      active_profile_required: false,
      style_check: styleCheck.data,
      writes,
      sources,
      user_confirmation_required: true,
    });
  }

  if (!previewOnly && revisedText) {
    await writeText(projectRoot, sourceRelPath, ensureTrailingNewline(revisedText));
    const contentHash = await sha256File(sourceFullPath);
    const title = firstMarkdownHeading(revisedText) ?? targetChapter.title;
    const updatedChapters: ChapterOutline = {
      chapters: inspection.chapters.chapters.map((outlineChapter) =>
        outlineChapter.id === targetChapter.id
          ? {
              ...outlineChapter,
              title,
              status: "revised",
              manuscript_path: sourceRelPath,
            }
          : outlineChapter,
      ),
    };
    const updatedIndex: ManuscriptIndex = {
      ...inspection.manuscriptIndex,
      generated_at: new Date().toISOString(),
      chapters: inspection.manuscriptIndex.chapters.map((indexedChapter) =>
        indexedChapter.id === targetChapter.id
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
      command: "openathor style revise",
      created_at: new Date().toISOString(),
      mode: "confirmed_write",
      goal,
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title,
        source_path: sourceRelPath,
      },
      base_hash: options.baseHash,
      previous_hash: sourceHash,
      content_hash: contentHash,
      profile: profileState.activeProfile,
      style_check_before: styleCheck.data,
      writes,
      sources,
      user_confirmation_required: false,
      manuscript_generated_by_cli: false,
    });
  }

  const mode = previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write";

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: dryRun || diff ? [] : writes,
    warnings: uniqueWarnings([
      ...inspection.warnings,
      ...styleReviseWarnings(profileState, styleCheck.warnings),
    ]),
    data: {
      dry_run: dryRun,
      mode,
      command: "openathor style revise",
      goal,
      target: styleReviseTarget(targetChapter, sourceHash),
      base_hash: options.baseHash ?? null,
      current_hash: sourceHash,
      profile: profileState.activeProfile,
      active_profile_present: profileState.activeProfile !== null,
      style_check: styleCheck.data,
      diff: {
        summary: "Style revision is externally generated by Pi/model and safely applied by OpenAthor CLI.",
        source_path: sourceRelPath,
        old_hash: sourceHash,
        text_supplied: Boolean(revisedText),
        manuscript_generated_by_cli: false,
      },
      planned_writes: dryRun || diff ? writes : [],
      proposal_path: previewOnly ? proposalRelPath : null,
      run_path: runRelPath,
      user_confirmation_required: previewOnly,
      result: {
        applied: !previewOnly && !dryRun,
        manuscript_modified: !previewOnly && !dryRun,
        outline_modified: !previewOnly && !dryRun,
        index_modified: !previewOnly && !dryRun,
        reference_text_copied: false,
      },
      next_agent_action: previewOnly
        ? "Generate or review revised prose, show the proposal to the user, then rerun with --confirm-write --base-hash after explicit approval."
        : "Run openathor style check chapter <target> --json and openathor assets audit --json before claiming the revision is stable.",
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
  const chapterEntityCoverage: ChapterEntityCoverage[] = [];
  const characterProfileCoverage: ChapterCharacterProfileCoverage[] = [];
  const characterProfileSummaryTexts = new Map<string, string[]>();
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

    for (const character of characters) {
      const linked = linkedCharacters.some((link) => isSameAssetReference(link, character));
      const mentioned = mentionedCharacters.includes(character.name);

      if (linked || mentioned) {
        const key = assetSummaryKey(character);
        characterProfileSummaryTexts.set(key, [
          ...(characterProfileSummaryTexts.get(key) ?? []),
          fullText,
        ]);
      }
    }

    for (const link of linkedCharacters) {
      const character = knownCharacters.get(link);

      if (!character) {
        continue;
      }

      const profileCoverage = characterAssetProfileCoverage(
        character,
        [chapter.title, chapter.summary ?? "", chapterText].join("\n"),
      );

      if (profileCoverage.checked_fields > 0) {
        characterProfileCoverage.push({
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          character_id: character.id,
          character_name: character.name,
          source_path: sourcePath,
          ...profileCoverage,
        });
      }
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

  const weakProfileCoverageCount = characterProfileCoverage.filter(
    (coverage) => coverage.coverage_ratio < 0.12,
  ).length;
  const characterProfileSummary = summarizeCharacterProfileCoverage(
    characters,
    chapterEntityCoverage,
    characterProfileCoverage,
    characterProfileSummaryTexts,
  );
  const weakCharacterProfileSummaryCount = characterProfileSummary.filter(
    (summary) =>
      summary.profile_field_count > 0 &&
      summary.chapters.length > 0 &&
      summary.coverage_ratio < 0.22,
  ).length;

  if (weakCharacterProfileSummaryCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_PROFILE_WEAK",
      message: `Found ${weakCharacterProfileSummaryCount} character profile summary candidate(s) with weak manuscript coverage across linked chapters.`,
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
          weak_character_profile_coverages: weakProfileCoverageCount,
          weak_character_profile_summaries: weakCharacterProfileSummaryCount,
          summary_drift_candidates: summaryDrift.length,
          unlinked_characters: unlinkedCharacters.length,
        },
        outline_link_issues: outlineLinkIssues,
        chapter_entity_coverage: chapterEntityCoverage,
        character_profile_coverage: characterProfileCoverage,
        character_profile_summary: characterProfileSummary,
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
  const sourceMap = new Map<string, EnvelopeSource>(
    replanSources(inspection.sources).map((source) => [source.path, source]),
  );
  const outlineHash = await sha256File(path.join(projectRoot, "outline/chapters.yaml"));
  sourceMap.set("outline/chapters.yaml", {
    path: "outline/chapters.yaml",
    hash: outlineHash,
  });
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
  const dryRun = options.dryRun ?? false;
  const confirm = options.confirm ?? false;
  const diff = options.diff ?? false;
  const previewOnly = dryRun || diff || !confirm;
  const packagePath = options.fromPackage
    ? normalizeOutlineReplanPackagePath(options.fromPackage)
    : null;
  const replanPackage = packagePath
    ? await readOutlineReplanPackage(projectRoot, packagePath, pathExists)
    : null;
  const plan = replanPackage
    ? buildOutlineReplanPlan(
        replanPackage,
        inspection.chapters.chapters,
        inspection.manuscriptIndex.chapters,
        from,
      )
    : null;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_outline_replan.json`;

  if (packagePath) {
    sourceMap.set(packagePath, {
      path: packagePath,
      hash: await sha256File(path.join(projectRoot, packagePath)),
    });
  }

  const plannedWrites = plan
    ? replanConfirmedWrites(runRelPath)
    : replanWrites(affected);
  const result = plan
    ? replanResult(plan, false)
    : {
        applied: false,
        outline_modified: false,
        index_modified: false,
        manuscript_files_modified: false,
      };
  const data = {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline replan",
    task,
    from: outlineTargetData(from, null),
    replan_package_path: packagePath,
    affected_chapters: affected,
    replacement_chapters: plan?.replacement_chapters ?? [],
    result,
    user_confirmation_required: previewOnly,
    confirmed_write_supported: Boolean(plan),
    planned_writes: previewOnly ? plannedWrites : [],
    diff: plan ? replanPackageDiff(from, plan) : replanDiff(from, affected),
    next_agent_action: plan
      ? previewOnly
        ? "Show this replan package to the user, then rerun with --confirm --base-hash only after explicit approval."
        : "Run openathor outline show --json and refresh context before drafting the replanned chapters."
      : "Use this proposal as a planning boundary. To confirm a replan, prepare a structured package and rerun with --from-package.",
  };

  if (!previewOnly) {
    if (!plan || !packagePath) {
      throw new OpenAthorError(
        "OA_OUTLINE_REPLAN_PACKAGE_REQUIRED",
        "Confirmed replan writes require --from-package <replan-package.yaml|json>.",
        { exitCode: 2 },
      );
    }

    if (!options.baseHash) {
      throw new OpenAthorError(
        "OA_BASE_HASH_REQUIRED",
        "Confirmed replan writes require --base-hash <sha256:...> for outline/chapters.yaml.",
        { exitCode: 2 },
      );
    }

    if (options.baseHash !== outlineHash) {
      throw new OpenAthorError(
        "OA_OUTLINE_CHANGED",
        "Refusing to confirm replan because outline/chapters.yaml changed.",
        {
          exitCode: 3,
          hints: [
            `Expected ${options.baseHash}.`,
            `Current ${outlineHash}.`,
            "Regenerate the replan package from the latest outline before confirming.",
          ],
        },
      );
    }

    validateConfirmedReplanSafe(plan, inspection.manuscriptIndex);

    const updatedChapters: ChapterOutline = {
      chapters: [
        ...plan.preserved_before,
        ...plan.replacement_chapters,
      ].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)),
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor outline replan",
      created_at: new Date().toISOString(),
      mode: "confirmed_write",
      task,
      from: outlineTargetData(from, null),
      base_hash: options.baseHash,
      replan_package_path: packagePath,
      replaced_chapters: plan.replaced_chapters,
      replacement_chapters: plan.replacement_chapters,
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
        ...data,
        result: replanResult(plan, true),
        user_confirmation_required: false,
        planned_writes: [],
        run_path: runRelPath,
      },
    };
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data,
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
    scope: proposalNeedsChapter(options) ? "chapter" : "project",
    target: proposalNeedsChapter(options) ? options.target : undefined,
  });
  const contextData = context.data as {
    context_pack: {
      scope: string;
      target: { id: string; display_order: number; title: string; source_path: string } | null;
    };
  };
  const proposalTarget =
    options.kind === "draft" && options.target === "next"
      ? await nextDraftTargetPreview(projectRoot, task)
      : contextData.context_pack.target;
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
  const proposalRelPath = proposalPath(options.kind, stamp, proposalTarget);
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
      target: proposalTarget,
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
          canonPendingProposalText(task, stamp, proposalTarget),
        );
      } else {
        await writeText(
          projectRoot,
          proposalRelPath,
          proposalMarkdown(options.kind, task, stamp, proposalTarget),
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
      target: proposalTarget,
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
  const plannedChapter = nextDraftablePlannedChapter(inspection);
  const nextOrder = plannedChapter?.display_order ?? nextDisplayOrder(inspection.manuscriptIndex);
  const chapterId =
    plannedChapter?.id ?? uniqueNewChapterId(nextOrder, inspection.manuscriptIndex);
  const title =
    firstMarkdownHeading(text) ??
    titleFromTask(task) ??
    plannedChapter?.title ??
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
      chapters: plannedChapter
        ? inspection.chapters.chapters.map((chapter) =>
            chapter.id === plannedChapter.id
              ? {
                  ...chapter,
                  title,
                  status: "drafted" as const,
                  manuscript_path: sourcePath,
                }
              : chapter,
          )
        : [
            ...inspection.chapters.chapters,
            {
              id: chapterId,
              display_order: nextOrder,
              title,
              status: "drafted" as const,
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
      filled_planned_chapter: plannedChapter !== null,
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
      filled_planned_chapter: plannedChapter !== null,
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
): Promise<AssetAuditSources> {
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

async function writeAssetSyncConfirmed(
  projectRoot: string,
  inspection: Awaited<ReturnType<typeof inspectProject>>,
  targetChapter: IndexedChapter,
  plan: AssetSyncPlan,
): Promise<void> {
  if (plan.new_characters.length > 0) {
    const charactersPath = path.join(projectRoot, "bible/characters.md");
    await writeFile(
      charactersPath,
      upsertAssetSyncCharactersMarkdown(
        await readFile(charactersPath, "utf8"),
        plan.new_characters,
      ),
      "utf8",
    );
  }

  if (plan.existing_characters.length > 0) {
    const charactersPath = path.join(projectRoot, "bible/characters.md");
    await writeFile(
      charactersPath,
      upsertAssetSyncCharactersMarkdown(
        await readFile(charactersPath, "utf8"),
        plan.existing_characters,
      ),
      "utf8",
    );
  }

  if (plan.new_timeline_events.length > 0) {
    const timelinePath = path.join(projectRoot, "bible/timeline.md");
    await writeFile(
      timelinePath,
      upsertAssetSyncTimelineMarkdown(
        await readFile(timelinePath, "utf8"),
        plan.new_timeline_events,
      ),
      "utf8",
    );
  }

  if (plan.existing_timeline_events.length > 0) {
    const timelinePath = path.join(projectRoot, "bible/timeline.md");
    await writeFile(
      timelinePath,
      upsertAssetSyncTimelineMarkdown(
        await readFile(timelinePath, "utf8"),
        plan.existing_timeline_events,
      ),
      "utf8",
    );
  }

  if (plan.new_hooks.length > 0) {
    const hooksPath = path.join(projectRoot, "notes/hooks.md");
    await writeFile(
      hooksPath,
      upsertAssetSyncHooksMarkdown(await readFile(hooksPath, "utf8"), plan.new_hooks),
      "utf8",
    );
  }

  if (plan.existing_hooks.length > 0) {
    const hooksPath = path.join(projectRoot, "notes/hooks.md");
    await writeFile(
      hooksPath,
      upsertAssetSyncHooksMarkdown(await readFile(hooksPath, "utf8"), plan.existing_hooks),
      "utf8",
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

async function activeStyleProfileState(
  projectRoot: string,
  sourceMap: Map<string, EnvelopeSource>,
): Promise<{
  activeProfile: Record<string, unknown> | null;
  profilesHash: string | null;
}> {
  const profilesRelPath = "style/profiles.yaml";
  const profilesPath = path.join(projectRoot, profilesRelPath);
  const profilesHash = (await pathExists(profilesPath)) ? await sha256File(profilesPath) : null;
  const profilesData = await readYamlObjectFile(profilesPath, { profiles: [] });
  const profiles = asRecordArray(profilesData.profiles);
  const activeProfile =
    profiles.find(
      (profile) => profile.status === "confirmed" && profile.active === true,
    ) ?? null;

  if (profilesHash) {
    sourceMap.set(profilesRelPath, { path: profilesRelPath, hash: profilesHash });
  }

  return { activeProfile, profilesHash };
}

function styleReviseTarget(
  chapter: IndexedChapter,
  sourceHash: string,
): {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
  content_hash: string;
} {
  return {
    id: chapter.id,
    display_order: chapter.display_order,
    title: chapter.title,
    source_path: chapter.source_path,
    content_hash: sourceHash,
  };
}

function styleReviseWarnings(
  profileState: { activeProfile: Record<string, unknown> | null },
  styleCheckWarnings: EnvelopeWarning[] | undefined,
): EnvelopeWarning[] {
  const warnings = [...(styleCheckWarnings ?? [])];

  if (!profileState.activeProfile) {
    warnings.push({
      code: "OA_STYLE_ACTIVE_PROFILE_MISSING",
      message: "No confirmed active style profile was found; style revision can only use manual style guidance and deterministic checks.",
      severity: "low",
    });
  }

  return warnings;
}

function styleReviseProposalMarkdown(input: {
  goal: string;
  target: IndexedChapter;
  sourceHash: string;
  profileState: { activeProfile: Record<string, unknown> | null; profilesHash: string | null };
  styleCheckData: unknown;
  revisedText?: string;
}): string {
  const styleCheckSummary = styleCheckDataSummary(input.styleCheckData);

  return [
    "# Style Revision Proposal",
    "",
    `- target: ${input.target.id}`,
    `- display_order: ${input.target.display_order}`,
    `- source_path: ${input.target.source_path}`,
    `- source_hash: ${input.sourceHash}`,
    `- goal: ${input.goal}`,
    `- active_profile_id: ${String(input.profileState.activeProfile?.id ?? "none")}`,
    `- profiles_hash: ${input.profileState.profilesHash ?? "missing"}`,
    "- manuscript_generated_by_cli: false",
    "- user_confirmation_required: true",
    "",
    "## Style Check Summary",
    "",
    `- verdict: ${styleCheckSummary.verdict ?? "unknown"}`,
    `- finding_count: ${styleCheckSummary.findingCount}`,
    "",
    "## Revised Text",
    "",
    input.revisedText
      ? input.revisedText
      : "No revised text was supplied. Pi/Operator Agent should generate prose externally, show it to the user, then confirm with --text and --base-hash.",
    "",
  ].join("\n");
}

function styleCheckDataSummary(data: unknown): {
  verdict?: string;
  findingCount: number;
} {
  if (typeof data !== "object" || data === null) {
    return { findingCount: 0 };
  }

  const record = data as { verdict?: unknown; findings?: unknown };
  return {
    verdict: typeof record.verdict === "string" ? record.verdict : undefined,
    findingCount: Array.isArray(record.findings) ? record.findings.length : 0,
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

function uniqueWarnings(warnings: EnvelopeWarning[]): EnvelopeWarning[] {
  const seen = new Set<string>();
  const result = [];

  for (const warning of warnings) {
    const key = `${warning.code}\u0000${warning.severity}\u0000${warning.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(warning);
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
      if (SKIPPED_TEXT_SCAN_DIRS.has(entry.name)) {
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

function nextDraftablePlannedChapter(
  inspection: Awaited<ReturnType<typeof inspectProject>>,
): ChapterOutlineEntry | null {
  const indexedIds = new Set(inspection.manuscriptIndex.chapters.map((chapter) => chapter.id));

  return (
    [...inspection.chapters.chapters]
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
      .find(
        (chapter) =>
          chapter.status === "planned" &&
          !chapter.manuscript_path &&
          !indexedIds.has(chapter.id),
      ) ?? null
  );
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

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function defaultMarkdownExportPath(config: ProjectConfig): string {
  const filename = `${slugAscii(config.project.title) || "manuscript"}.md`;
  return `exports/${filename}`;
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

function proposalNeedsChapter(options: Pick<WritingProposalOptions, "kind" | "target">): boolean {
  if (options.kind === "draft" && options.target === "next") {
    return false;
  }

  return options.kind === "draft" || options.kind === "review" || options.kind === "revise";
}

function proposalCommandName(kind: WritingProposalKind): string {
  if (kind === "canon_sync") {
    return "openathor canon sync";
  }

  return `openathor ${kind}`;
}

async function nextDraftTargetPreview(
  projectRoot: string,
  task: string,
): Promise<{ id: string; display_order: number; title: string; source_path: string }> {
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const plannedChapter = nextDraftablePlannedChapter(inspection);
  const nextOrder = plannedChapter?.display_order ?? nextDisplayOrder(inspection.manuscriptIndex);
  const chapterId =
    plannedChapter?.id ?? uniqueNewChapterId(nextOrder, inspection.manuscriptIndex);
  const title =
    titleFromTask(task) ??
    plannedChapter?.title ??
    inspection.config.project.title ??
    `Chapter ${nextOrder}`;

  return {
    id: chapterId,
    display_order: nextOrder,
    title,
    source_path: `manuscript/chapter-${String(nextOrder).padStart(3, "0")}.md`,
  };
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
