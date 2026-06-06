import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { OpenAthorError } from "./errors.js";
import { normalizeAssetSyncPackage } from "./asset-sync-package-normalizer.js";
import type { AssetSyncPackage } from "./model.js";
import { ensureSafeRelativePath, toPosix } from "./paths.js";

export async function readAssetSyncPackage(
  projectRoot: string,
  safeRelPath: string,
): Promise<AssetSyncPackage> {
  const fullPath = path.join(projectRoot, safeRelPath);

  if (!(await pathExists(fullPath))) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_NOT_FOUND",
      `Asset sync package not found: ${safeRelPath}`,
      { exitCode: 2 },
    );
  }

  const text = await readFile(fullPath, "utf8");
  let parsed: unknown;

  try {
    parsed =
      safeRelPath.endsWith(".json") || safeRelPath.endsWith(".jsonc")
        ? JSON.parse(text)
        : parseYaml(text);
  } catch (error) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_INVALID",
      `Cannot parse asset sync package ${safeRelPath}: ${String(error)}`,
      { exitCode: 3 },
    );
  }

  return normalizeAssetSyncPackage(parsed);
}

export function normalizeAssetSyncPackagePath(relPath: string | undefined): string {
  if (!relPath?.trim()) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_REQUIRED",
      "openathor assets sync requires --from <asset-package.json|yaml>.",
      { exitCode: 2 },
    );
  }

  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "--from");

  return safeRelPath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
