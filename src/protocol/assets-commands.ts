import path from "node:path";
import { buildAssetAuditResult } from "./asset-audit.js";
import {
  assetSyncPendingText,
  assetSyncSummary,
  assetSyncWrites,
  buildAssetSyncPlan,
  writeAssetSyncConfirmed,
} from "./asset-sync.js";
import {
  normalizeAssetSyncPackagePath,
  readAssetSyncPackage,
} from "./asset-sync-package.js";
import { resolveContextChapter } from "./chapter-target.js";
import { readAssetAuditSources } from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  appendText,
  findProjectRoot,
  writeYaml,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { runStamp } from "./run-stamp.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import type {
  AssetsAuditOptions,
  AssetsSyncOptions,
  CommandResult,
} from "./model.js";

const ASSET_SYNC_CONFIRMED_ACTION =
  "Run openathor index rebuild --json, then openathor assets audit --json " +
  "and refresh context before continuing the longform draft.";
const ASSET_SYNC_PROPOSAL_ACTION =
  "Show this pending asset sync to the user, then rerun with --confirm " +
  "--base-hash only after explicit approval.";

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
  const assetSourceHashes = await assetSyncAssetSourceHashes(projectRoot, plan);
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

    checkAssetSyncSourceHashes(options.assetHashes ?? [], assetSourceHashes);
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
      asset_hashes: assetSourceHashes,
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
      asset_hashes: assetSourceHashes,
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
          "The CLI validates and merges structured asset packages; it does not " +
          "infer complex story facts from prose.",
      },
      next_agent_action: confirm
        ? ASSET_SYNC_CONFIRMED_ACTION
        : ASSET_SYNC_PROPOSAL_ACTION,
    },
  };
}

async function assetSyncAssetSourceHashes(
  projectRoot: string,
  plan: ReturnType<typeof buildAssetSyncPlan>,
): Promise<Record<string, string>> {
  const paths = new Set<string>();

  if (plan.new_characters.length > 0 || plan.existing_characters.length > 0) {
    paths.add("bible/characters.md");
  }

  if (plan.new_timeline_events.length > 0 || plan.existing_timeline_events.length > 0) {
    paths.add("bible/timeline.md");
  }

  if (plan.new_hooks.length > 0 || plan.existing_hooks.length > 0) {
    paths.add("notes/hooks.md");
  }

  if (plan.outline_modified) {
    paths.add("outline/chapters.yaml");
  }

  const hashes: Record<string, string> = {};
  for (const relPath of [...paths].sort()) {
    hashes[relPath] = await sha256File(path.join(projectRoot, relPath));
  }

  return hashes;
}

function checkAssetSyncSourceHashes(
  providedHashes: string[],
  requiredSourceHashes: Record<string, string>,
): void {
  const requiredPaths = Object.keys(requiredSourceHashes);
  if (requiredPaths.length === 0) {
    return;
  }

  const provided = new Map(
    providedHashes.map((value) => {
      const separator = value.indexOf("=");
      if (separator <= 0) {
        throw new OpenAthorError(
          "OA_ASSETS_HASH_INVALID",
          `Invalid --assets-hash value ${value}.`,
          {
            exitCode: 2,
            hints: ["Use --assets-hash <path=sha256:...> for each asset source to be written."],
          },
        );
      }

      return [value.slice(0, separator), value.slice(separator + 1)] as const;
    }),
  );

  const missing = requiredPaths.filter((relPath) => !provided.has(relPath));
  if (missing.length > 0) {
    throw new OpenAthorError(
      "OA_ASSETS_HASH_REQUIRED",
      "Confirmed asset sync writes require current hashes for every asset source that will be modified.",
      {
        exitCode: 2,
        hints: missing.map((relPath) => `Add --assets-hash ${relPath}=<current sha256 hash>.`),
      },
    );
  }

  const mismatches = [];
  for (const relPath of requiredPaths) {
    if (provided.get(relPath) !== requiredSourceHashes[relPath]) {
      mismatches.push({
        relPath,
        expected: provided.get(relPath),
        currentHash: requiredSourceHashes[relPath],
      });
    }
  }

  if (mismatches.length > 0) {
    throw new OpenAthorError(
      "OA_ASSETS_SOURCE_CHANGED",
      "Refusing to sync assets because one or more asset source files changed.",
      {
        exitCode: 4,
        hints: mismatches.flatMap((item) => [
          `${item.relPath} expected ${item.expected}.`,
          `${item.relPath} current ${item.currentHash}.`,
          "Regenerate or review the asset package against the latest story assets before confirming.",
        ]),
      },
    );
  }
}
