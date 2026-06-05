import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isAssetIdForKind } from "./asset-ids.js";
import { OpenAthorError } from "./errors.js";
import type {
  AssetEntity,
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncPackage,
  AssetSyncTimelineEvent,
} from "./model.js";
import { ensureSafeRelativePath, toPosix } from "./paths.js";
import { isPlainRecord, optionalString, stringArray } from "./value.js";

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

function normalizeAssetSyncPackage(value: unknown): AssetSyncPackage {
  if (!isPlainRecord(value)) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_INVALID",
      "Asset sync package must be a JSON/YAML object.",
      { exitCode: 3 },
    );
  }

  const record = value;
  const chapterRecord = isPlainRecord(record.chapter) ? record.chapter : {};
  const linksRecord = isPlainRecord(chapterRecord.links) ? chapterRecord.links : {};
  const pkg: AssetSyncPackage = {
    characters: normalizeAssetSyncCharacters(record.characters),
    timeline_events: normalizeAssetSyncTimelineEvents(record.timeline_events),
    hooks: normalizeAssetSyncHooks(record.hooks),
    chapter: {
      summary: optionalString(chapterRecord.summary),
      links: {
        characters: stringArray(linksRecord.characters),
        timeline_events: stringArray(linksRecord.timeline_events),
        hooks: stringArray(linksRecord.hooks),
      },
    },
  };

  const linkedCharacterIds = new Set(pkg.chapter.links.characters);
  const linkedTimelineIds = new Set(pkg.chapter.links.timeline_events);
  const linkedHookIds = new Set(pkg.chapter.links.hooks);

  for (const character of pkg.characters) {
    linkedCharacterIds.add(character.id);
  }
  for (const event of pkg.timeline_events) {
    linkedTimelineIds.add(event.id);
  }
  for (const hook of pkg.hooks) {
    linkedHookIds.add(hook.id);
  }

  pkg.chapter.links = {
    characters: [...linkedCharacterIds],
    timeline_events: [...linkedTimelineIds],
    hooks: [...linkedHookIds],
  };

  return pkg;
}

function normalizeAssetSyncCharacters(value: unknown): AssetSyncCharacter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("characters", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "character", "characters", index);
    const name = requiredAssetSyncString(item.name, "characters", index, "name");

    return {
      id,
      name,
      role: optionalString(item.role),
      traits: stringArray(item.traits),
      current_state: optionalString(item.current_state),
      notes: stringArray(item.notes),
    };
  });
}

function normalizeAssetSyncTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("timeline_events", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "timeline_event", "timeline_events", index);

    return {
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(item.summary, "timeline_events", index, "title"),
      summary: optionalString(item.summary),
      notes: stringArray(item.notes),
    };
  });
}

function normalizeAssetSyncHooks(value: unknown): AssetSyncHook[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("hooks", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "hook", "hooks", index);

    return {
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(item.summary, "hooks", index, "title"),
      status: optionalString(item.status),
      summary: optionalString(item.summary),
      notes: stringArray(item.notes),
    };
  });
}

function requiredAssetSyncId(
  value: unknown,
  kind: AssetEntity["kind"],
  section: string,
  index: number,
): string {
  const id = requiredAssetSyncString(value, section, index, "id");
  if (!isAssetIdForKind(id, kind)) {
    throw invalidAssetSyncItem(section, index, `id ${id} is not valid for ${kind}`);
  }

  return id;
}

function requiredAssetSyncString(
  value: unknown,
  section: string,
  index: number,
  field: string,
): string {
  const text = optionalString(value);
  if (!text) {
    throw invalidAssetSyncItem(section, index, `requires ${field}`);
  }

  return text;
}

function invalidAssetSyncItem(section: string, index: number, reason: string): OpenAthorError {
  return new OpenAthorError(
    "OA_ASSETS_SYNC_PACKAGE_INVALID",
    `Invalid asset sync package item ${section}.${index}: ${reason}.`,
    { exitCode: 3 },
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
