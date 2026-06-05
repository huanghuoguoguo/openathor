import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { PROTOCOL_VERSION } from "./constants.js";
import {
  buildAdoptQuestions,
  buildIndexedChapters,
  classifyFile,
  duplicateNumericOrders,
  scanUserFiles,
} from "./adopt-files.js";
import { buildAssetAuditResult } from "./asset-audit.js";
import {
  assetSyncPendingText,
  assetSyncSummary,
  assetSyncWrites,
  buildAssetSyncPlan,
  writeAssetSyncConfirmed,
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
  sha256File,
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
import { buildOutlineImpactData } from "./outline-impact.js";
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
  buildConfirmedDraftPlan,
  buildConfirmedRevisionPlan,
  buildWritingProposalPlan,
  confirmedDraftResultData,
  confirmedDraftRunRecord,
  confirmedDraftUpdates,
  confirmedRevisionResultData,
  confirmedRevisionRunRecord,
  confirmedRevisionUpdates,
  nextDraftTargetPreview,
  proposalCommandName,
  proposalNeedsChapter,
  writingProposalData,
  writingProposalPath,
  writingProposalRunRecord,
  writingProposalText,
  type WritingTarget,
} from "./writing-operations.js";
import { ensureTrailingNewline } from "./text-format.js";
import {
  extractSearchTerms,
  findTextMatches,
  normalizeLimit,
  normalizeSnippetChars,
  relatedScore,
  snippetAround,
} from "./text-analysis.js";
import {
  buildVectorIndex,
  searchCandidatePaths,
  semanticVectorMatches,
} from "./retrieval-files.js";
import {
  contextData,
  contextWindow,
  normalizeContextMaxChars,
} from "./context-pack.js";
import {
  readAssetAuditSources,
  readContextSource,
  readNotesContext,
} from "./context-sources.js";
import {
  defaultMarkdownExportPath,
  exportableManuscriptChapters,
  markdownExportData,
} from "./export-markdown.js";
import {
  buildStyleProfile,
  extractStyleRules,
  normalizeStylePermission,
  normalizeStyleProfileId,
  normalizeStyleReferencePath,
  normalizeStyleSourceType,
  styleDriftFindings,
  styleMetrics,
  styleRuleMatches,
} from "./style-analysis.js";
import {
  styleReviseProposalMarkdown,
  styleReviseTarget,
  styleReviseWarnings,
  type ActiveStyleProfileState,
} from "./style-revise.js";
import { firstMarkdownHeading } from "./title.js";
import { isPlainRecord, optionalString, stringArray } from "./value.js";
import { PI_SKILL_TEXT } from "../skills/pi-skill.js";
import {
  STANDARD_ASSET_DIRECTORIES,
  REQUIRED_DIRECTORIES,
  adoptWrites,
  createProjectConfig,
  skeletonWrites,
} from "./project-layout.js";
import {
  inspectionWithManuscriptIndex,
  inspectProject,
  readProjectId,
  rebuildManuscriptIndexFromOutline,
  writeSqliteIndex,
} from "./project-inspection.js";
import {
  addKnownSource,
  appendText,
  findProjectRoot,
  hashSources,
  hasEntries,
  pathExists,
  readSourceText,
  writeText,
  writeYaml,
} from "./project-files.js";
import { shortHash } from "./identifiers.js";
import { isTextCandidate } from "./text-path.js";
import type {
  AdoptOptions,
  AssetsAuditOptions,
  AssetsSyncOptions,
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
  SearchRelatedOptions,
  SearchSemanticOptions,
  SearchTextOptions,
  SkillInstallOptions,
  StyleAnalyzeOptions,
  StyleCheckOptions,
  StyleProfileApplyOptions,
  StyleProfileShowOptions,
  StyleReviseOptions,
  VectorIndex,
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
  const maxChars = normalizeContextMaxChars(options.maxChars).section;
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
  const audit = await buildAssetAuditResult({
    projectRoot,
    inspection,
    assetFiles,
    maxChars,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: audit.warnings,
    data: audit.data,
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
      await writeAssetSyncConfirmed(projectRoot, inspection.chapters, targetChapter, plan);
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
        ? "Run openathor index rebuild --json, then openathor assets audit --json and refresh context before continuing the longform draft."
        : "Show this pending asset sync to the user, then rerun with --confirm --base-hash only after explicit approval.",
    },
  };
}

export async function runContext(options: ContextOptions = {}): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const scope = options.scope ?? "project";
  const maxChars = normalizeContextMaxChars(options.maxChars);
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
    data: contextData({
      generatedAt: new Date().toISOString(),
      scope,
      targetInput: options.target,
      targetChapter,
      maxChars,
      config: inspection.config,
      chapters: inspection.chapters,
      manuscriptIndex: inspection.manuscriptIndex,
      confirmedCanon,
      pendingCanon,
      style,
      styleProfiles,
      styleReferences,
      world,
      characters,
      timeline,
      notes,
      manuscriptContext: manuscript,
    }),
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
  const data = await buildOutlineImpactData({
    projectRoot,
    inspection,
    target,
    maxChars,
    sourceMap,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data,
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
    ? await readSourceText(projectRoot, target.source_path, sourceMap)
    : null;
  const nextSource = next.source_path
    ? await readSourceText(projectRoot, next.source_path, sourceMap)
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
  const targetSource = await readSourceText(projectRoot, target.source_path);
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
    ? await readSourceText(projectRoot, target.source_path)
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
  const { queryTerms, matches } = semanticVectorMatches(
    vectorIndex,
    query,
    maxChars,
    limit,
  );

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
      target: WritingTarget | null;
    };
  };
  const proposalTarget =
    options.kind === "draft" && options.target === "next"
      ? nextDraftTargetPreview(
          await inspectProject(projectRoot, { includeIndexWarning: true }),
          task,
        )
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
  const proposalRelPath = writingProposalPath(options.kind, stamp, proposalTarget);
  const plan = buildWritingProposalPlan({
    kind: options.kind,
    stamp,
    target: proposalTarget,
    proposalExists: await pathExists(path.join(projectRoot, proposalRelPath)),
  });

  if (!dryRun) {
    const runRecord = writingProposalRunRecord({
      plan,
      task,
      target: proposalTarget,
      sources: context.sources ?? [],
      createdAt: new Date().toISOString(),
    });
    await writeYaml(projectRoot, plan.runRelPath, runRecord);

    const proposalText = writingProposalText({
      kind: options.kind,
      task,
      stamp,
      target: proposalTarget,
    });
    if (options.kind === "canon_sync") {
      await appendText(projectRoot, plan.proposalRelPath, proposalText);
    } else {
      await writeText(projectRoot, plan.proposalRelPath, proposalText);
    }
  }

  return {
    projectRoot,
    projectId: context.projectId,
    sources: context.sources,
    writes: dryRun ? [] : plan.writes,
    warnings: context.warnings,
    data: writingProposalData({
      dryRun,
      kind: options.kind,
      task,
      target: proposalTarget,
      contextPack: contextData.context_pack,
      plan,
    }),
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
  const plan = buildConfirmedDraftPlan(inspection, task, text, runStamp());
  const fullSourcePath = path.join(projectRoot, plan.sourcePath);

  if (await pathExists(fullSourcePath)) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_TARGET_EXISTS",
      `Refusing to overwrite existing manuscript file ${plan.sourcePath}.`,
      { exitCode: 3 },
    );
  }

  if (!dryRun) {
    await writeText(projectRoot, plan.sourcePath, ensureTrailingNewline(text));
    const contentHash = await sha256File(fullSourcePath);
    const generatedAt = new Date().toISOString();
    const { chapters: updatedChapters, manuscriptIndex: updatedIndex } =
      confirmedDraftUpdates({
        state: inspection,
        plan,
        contentHash,
        generatedAt,
    });
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(
      projectRoot,
      plan.runRelPath,
      confirmedDraftRunRecord({
        task,
        sources: inspection.sources,
        plan,
        createdAt: generatedAt,
      }),
    );
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : plan.writes,
    warnings: inspection.warnings,
    data: confirmedDraftResultData({
      dryRun,
      task,
      plan,
    }),
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
  const plan = buildConfirmedRevisionPlan({
    chapter,
    text,
    baseHash: options.baseHash,
    stamp,
  });

  if (!dryRun) {
    await writeText(projectRoot, chapter.source_path, ensureTrailingNewline(text));
    const contentHash = await sha256File(fullSourcePath);
    const generatedAt = new Date().toISOString();
    const { chapters: updatedChapters, manuscriptIndex: updatedIndex } =
      confirmedRevisionUpdates({
        state: inspection,
        plan,
        contentHash,
        generatedAt,
      });
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
    await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", updatedIndex);
    await writeYaml(
      projectRoot,
      plan.runRelPath,
      confirmedRevisionRunRecord({
        task,
        plan,
        sources: inspection.sources,
        createdAt: generatedAt,
      }),
    );
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: inspection.sources,
    writes: dryRun ? [] : plan.writes,
    warnings: inspection.warnings,
    data: confirmedRevisionResultData({
      dryRun,
      task,
      plan,
    }),
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

async function activeStyleProfileState(
  projectRoot: string,
  sourceMap: Map<string, EnvelopeSource>,
): Promise<ActiveStyleProfileState> {
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
