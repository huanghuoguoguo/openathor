import path from "node:path";
import {
  assetSyncPendingText,
  assetSyncWrites,
  buildAssetSyncPlan,
  writeAssetSyncConfirmed,
} from "./asset-sync.js";
import {
  normalizeAssetSyncPackagePath,
  readAssetSyncPackage,
} from "./asset-sync-package.js";
import {
  assetSyncAssetSourceHashes,
  checkAssetSyncSourceHashes,
} from "./asset-sync-command-hashes.js";
import {
  assetSyncResultData,
  assetSyncRunRecord,
} from "./asset-sync-command-output.js";
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
import type {
  AssetsSyncOptions,
  CommandResult,
} from "./model.js";

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
  const baseHash = options.baseHash ?? null;

  if (confirm) {
    validateAssetSyncConfirm({
      baseHash,
      sourceHash,
      targetId: targetChapter.id,
      providedAssetHashes: options.assetHashes ?? [],
      requiredAssetHashes: assetSourceHashes,
    });
  }

  const writes = assetSyncWrites(confirm, plan, runRelPath, proposalRelPath);
  const output = {
    confirm,
    dryRun,
    targetChapter,
    sourcePath,
    sourceHash,
    baseHash,
    assetSourceHashes,
    assetPackagePath,
    runRelPath,
    proposalRelPath,
    plan,
    writes,
    sources,
  };

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

    await writeYaml(projectRoot, runRelPath, assetSyncRunRecord({
      ...output,
      createdAt: new Date().toISOString(),
    }));
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: dryRun ? [] : writes,
    warnings: inspection.warnings,
    data: assetSyncResultData(output),
  };
}

function validateAssetSyncConfirm(input: {
  baseHash: string | null;
  sourceHash: string;
  targetId: string;
  providedAssetHashes: string[];
  requiredAssetHashes: Record<string, string>;
}): void {
  if (!input.baseHash) {
    throw new OpenAthorError(
      "OA_BASE_HASH_REQUIRED",
      "Confirmed asset sync writes require --base-hash <sha256:...>.",
      { exitCode: 2 },
    );
  }

  if (input.baseHash !== input.sourceHash) {
    throw new OpenAthorError(
      "OA_MANUSCRIPT_CHANGED",
      `Refusing to sync assets for ${input.targetId} because the source hash changed.`,
      {
        exitCode: 3,
        hints: [
          `Expected ${input.baseHash}.`,
          `Current ${input.sourceHash}.`,
          "Regenerate the asset package from the latest chapter text before confirming.",
        ],
      },
    );
  }

  checkAssetSyncSourceHashes(input.providedAssetHashes, input.requiredAssetHashes);
}
