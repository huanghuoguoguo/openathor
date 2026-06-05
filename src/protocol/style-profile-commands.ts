import path from "node:path";
import { readContextSource } from "./context-sources.js";
import { normalizeContextMaxChars } from "./context-pack.js";
import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  pathExists,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import { normalizeStyleProfileId } from "./style-analysis.js";
import {
  asRecordArray,
  readYamlObjectFile,
} from "./yaml-records.js";
import type {
  CommandResult,
  StyleProfileApplyOptions,
  StyleProfileShowOptions,
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
