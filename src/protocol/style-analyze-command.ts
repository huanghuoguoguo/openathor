import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EnvelopeWrite } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { shortHash } from "./identifiers.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  pathExists,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import {
  buildStyleProfile,
  normalizeStylePermission,
  normalizeStyleProfileId,
  normalizeStyleReferencePath,
  normalizeStyleSourceType,
  styleMetrics,
} from "./style-analysis.js";
import { isTextCandidate } from "./text-path.js";
import {
  asRecordArray,
  readYamlObjectFile,
  replaceRecordById,
} from "./yaml-records.js";
import type {
  CommandResult,
  StyleAnalyzeOptions,
} from "./model.js";

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
