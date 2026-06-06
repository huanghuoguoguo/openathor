import path from "node:path";
import {
  assetLinkBackfillResult,
  assetLinkBackfillWrites,
  buildAssetLinkBackfillPlan,
} from "./asset-link-backfill.js";
import { readAssetAuditSources } from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import type {
  AssetsLinkBackfillOptions,
  CommandResult,
} from "./model.js";

const LINK_BACKFILL_CONFIRMED_ACTION =
  "Run openathor assets audit --json and refresh context before continuing.";
const LINK_BACKFILL_PROPOSAL_ACTION =
  "Show this deterministic link backfill to the user, then rerun with --confirm " +
  "--base-hash only after explicit approval.";

export async function runAssetsLinkBackfill(
  options: AssetsLinkBackfillOptions = {},
): Promise<CommandResult> {
  if ((options.kind ?? "characters") !== "characters") {
    throw new OpenAthorError(
      "OA_ASSETS_LINK_BACKFILL_UNSUPPORTED_KIND",
      "openathor assets link-backfill currently supports only characters.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const outlinePath = "outline/chapters.yaml";
  const outlineHash = await sha256File(path.join(projectRoot, outlinePath));
  sourceMap.set(outlinePath, { path: outlinePath, hash: outlineHash });
  const assetFiles = await readAssetAuditSources(projectRoot, sourceMap);
  const plan = await buildAssetLinkBackfillPlan({
    projectRoot,
    inspection,
    assetFiles,
  });
  const confirm = options.confirm ?? false;
  const dryRun = options.dryRun ?? false;
  const stamp = runStamp();
  const runRelPath = `runs/run_${stamp}_assets_link_backfill.json`;
  const writes = assetLinkBackfillWrites(confirm, plan, runRelPath);
  const sources = [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));

  if (confirm) {
    validateConfirmedLinkBackfill(options.baseHash, outlineHash);
  }

  if (!dryRun) {
    if (confirm && plan.changes.length > 0) {
      await writeYaml(projectRoot, outlinePath, plan.updated_outline);
    }

    await writeYaml(projectRoot, runRelPath, {
      agent_role: "openathor-cli",
      command: "openathor assets link-backfill",
      created_at: new Date().toISOString(),
      mode: confirm ? "confirmed_write" : "proposal",
      kind: "characters",
      source_hash: outlineHash,
      base_hash: options.baseHash ?? null,
      result: assetLinkBackfillResult(plan, confirm),
      proposed_changes: plan.changes,
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
      command: "openathor assets link-backfill",
      kind: "characters",
      source_hash: outlineHash,
      base_hash: options.baseHash ?? null,
      planned_writes: dryRun ? writes : [],
      run_path: runRelPath,
      user_confirmation_required: !confirm,
      result: assetLinkBackfillResult(plan, confirm),
      proposed_changes: plan.changes,
      backfill: {
        method: "deterministic_confirmed_character_name_scan",
        confirmed_characters_considered: plan.characters.length,
        writes_only_outline_links: true,
        inference_note:
          "The CLI only links confirmed characters whose names already appear in chapter title, summary, or manuscript text.",
      },
      next_agent_action: confirm
        ? LINK_BACKFILL_CONFIRMED_ACTION
        : LINK_BACKFILL_PROPOSAL_ACTION,
    },
  };
}

function validateConfirmedLinkBackfill(
  baseHash: string | undefined,
  outlineHash: string,
): void {
  if (!baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed asset link backfill writes require --base-hash <sha256:...> for outline/chapters.yaml.",
      { exitCode: 2 },
    );
  }

  if (baseHash !== outlineHash) {
    throw new OpenAthorError(
      "OA_OUTLINE_CHANGED",
      "Refusing to confirm asset link backfill because outline/chapters.yaml changed.",
      {
        exitCode: 3,
        hints: [
          `Expected ${baseHash}.`,
          `Current ${outlineHash}.`,
          "Rerun the link-backfill proposal from the latest outline before confirming.",
        ],
      },
    );
  }
}
