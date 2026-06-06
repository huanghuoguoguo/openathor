import path from "node:path";
import { OpenAthorError } from "./errors.js";
import type { AssetSyncPlan } from "./model.js";
import { sha256File } from "./paths.js";

export async function assetSyncAssetSourceHashes(
  projectRoot: string,
  plan: AssetSyncPlan,
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

export function checkAssetSyncSourceHashes(
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
