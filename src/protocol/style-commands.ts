import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import { readContextSource } from "./context-sources.js";
import { normalizeContextMaxChars } from "./context-pack.js";
import { uniqueWarnings } from "./envelope.js";
import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { shortHash } from "./identifiers.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
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
import { detectStyleReferenceCopy } from "./style-reference-copy.js";
import {
  styleReviseProposalMarkdown,
  styleReviseTarget,
  styleReviseWarnings,
  type ActiveStyleProfileState,
} from "./style-revise.js";
import { ensureTrailingNewline } from "./text-format.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import { isTextCandidate } from "./text-path.js";
import { firstMarkdownHeading } from "./title.js";
import {
  asRecordArray,
  readYamlObjectFile,
  replaceRecordById,
} from "./yaml-records.js";
import type {
  ChapterOutline,
  CommandResult,
  ManuscriptIndex,
  StyleAnalyzeOptions,
  StyleCheckOptions,
  StyleProfileApplyOptions,
  StyleProfileShowOptions,
  StyleReviseOptions,
} from "./model.js";

const STYLE_PROFILE_SOURCE_PATHS = new Set([
  "style/profiles.yaml",
  "style/references.yaml",
  "bible/style.md",
]);
const STYLE_PROFILE_CONFIRM_ACTION =
  "Show this style profile confirmation to the user, then rerun with --confirm " +
  "--base-hash after explicit approval.";
const STYLE_PROFILE_APPLIED_ACTION =
  "Run openathor style profile show --json and use the confirmed profile as " +
  "project style guidance.";
const STYLE_REVISE_PROPOSAL_ACTION =
  "Generate or review revised prose, show the proposal to the user, then rerun " +
  "with --confirm-write --base-hash after explicit approval.";
const STYLE_REVISE_CONFIRMED_ACTION =
  "Run openathor style check chapter <target> --json and openathor assets audit " +
  "--json before claiming the revision is stable.";

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
    .filter((source) => STYLE_PROFILE_SOURCE_PATHS.has(source.path))
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
      summary:
        "Confirm one pending style profile as active project style; no manuscript text is changed.",
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
      ? STYLE_PROFILE_CONFIRM_ACTION
      : STYLE_PROFILE_APPLIED_ACTION,
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
          "Rerun openathor style profile show --json and ask the user to " +
            "confirm the latest profile.",
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
  const profileName =
    options.name?.trim() || `Style profile from ${path.posix.basename(referencePath)}`;
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
        "Use openathor style revise chapter <target> --goal ... for " +
          "style-specific proposal, diff, and hash-confirm workflow.",
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
  const goal =
    options.goal?.trim() ||
    "Revise the target chapter toward confirmed project style guidance.";
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
      "Refusing style revision because the supplied manuscript text appears " +
        "to copy reference text.",
      {
        exitCode: 4,
        hints: [
          `Reference: ${referenceCopy.reference_path}.`,
          `Matched excerpt: ${referenceCopy.excerpt}.`,
          "Rewrite the passage using project-specific wording, then rerun " +
            "style revise with the latest source hash.",
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
        summary:
          "Style revision is externally generated by Pi/model and safely applied by OpenAthor CLI.",
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
        ? STYLE_REVISE_PROPOSAL_ACTION
        : STYLE_REVISE_CONFIRMED_ACTION,
    },
  };
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
  referencesData.references = replaceRecordById(
    asRecordArray(referencesData.references),
    reference,
  );

  await writeYaml(projectRoot, "style/profiles.yaml", profilesData);
  await writeYaml(projectRoot, "style/references.yaml", referencesData);
}
