import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import { uniqueWarnings } from "./envelope.js";
import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import { runStyleCheck } from "./style-check-command.js";
import { detectStyleReferenceCopy } from "./style-reference-copy.js";
import {
  styleReviseProposalMarkdown,
  styleReviseTarget,
  styleReviseWarnings,
  type ActiveStyleProfileState,
} from "./style-revise.js";
import { ensureTrailingNewline } from "./text-format.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import { titleFromText } from "./title.js";
import {
  asRecordArray,
  readYamlObjectFile,
} from "./yaml-records.js";
import type {
  ChapterOutline,
  CommandResult,
  ManuscriptIndex,
  StyleReviseOptions,
} from "./model.js";

const STYLE_REVISE_PROPOSAL_ACTION =
  "Generate or review revised prose, show the proposal to the user, then rerun " +
  "with --confirm-write --base-hash after explicit approval.";
const STYLE_REVISE_CONFIRMED_ACTION =
  "Run openathor style check chapter <target> --json and openathor assets audit " +
  "--json before claiming the revision is stable.";

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
    const title = titleFromText(revisedText) ?? targetChapter.title;
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
