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
import { isPlainRecord, optionalString } from "./value.js";

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
  const topLinksRecord = isPlainRecord(record.links) ? record.links : {};
  const linksRecord = isPlainRecord(chapterRecord.links) ? chapterRecord.links : topLinksRecord;
  const updatesRecord = isPlainRecord(record.updates) ? record.updates : {};
  const pkg: AssetSyncPackage = {
    characters: mergeById([
      ...normalizeAssetSyncCharacters(record.characters),
      ...normalizeAssetLinkCharacters(topLinksRecord.characters),
      ...normalizeAssetUpdateCharacters(updatesRecord.characters),
    ], mergeAssetSyncCharacters),
    timeline_events: mergeById([
      ...normalizeAssetSyncTimelineEvents(record.timeline_events),
      ...normalizeAssetLinkTimelineEvents(topLinksRecord.timeline_events),
      ...normalizeAssetUpdateTimelineEvents(updatesRecord.timeline_events),
    ], mergeAssetSyncTimelineEvents),
    hooks: mergeById([
      ...normalizeAssetSyncHooks(record.hooks),
      ...normalizeAssetLinkHooks(topLinksRecord.hooks),
      ...normalizeAssetUpdateHooks(updatesRecord.hooks),
    ], mergeAssetSyncHooks),
    chapter: {
      summary: optionalString(chapterRecord.summary),
      links: {
        characters: assetReferenceArray(linksRecord.characters),
        timeline_events: assetReferenceArray(linksRecord.timeline_events),
        hooks: assetReferenceArray(linksRecord.hooks),
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

  if (
    !pkg.chapter.summary &&
    pkg.chapter.links.characters.length === 0 &&
    pkg.chapter.links.timeline_events.length === 0 &&
    pkg.chapter.links.hooks.length === 0 &&
    pkg.characters.length === 0 &&
    pkg.timeline_events.length === 0 &&
    pkg.hooks.length === 0
  ) {
    throw new OpenAthorError(
      "OA_ASSETS_SYNC_PACKAGE_EMPTY",
      "Asset sync package contains no chapter summary, links, characters, timeline events, or hooks.",
      {
        exitCode: 3,
        hints: [
          "Use top-level characters/timeline_events/hooks arrays plus chapter.links.",
          "Agent-generated links.characters objects and updates.* entries are accepted, but they must contain valid ids.",
        ],
      },
    );
  }

  return pkg;
}

function normalizeAssetSyncCharacters(value: unknown): AssetSyncCharacter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.map((item, index) => {
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
  }), mergeAssetSyncCharacters);
}

function normalizeAssetSyncTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.map((item, index) => {
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
  }), mergeAssetSyncTimelineEvents);
}

function normalizeAssetSyncHooks(value: unknown): AssetSyncHook[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.map((item, index) => {
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
  }), mergeAssetSyncHooks);
}

function normalizeAssetLinkCharacters(value: unknown): AssetSyncCharacter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [];
    }
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("links.characters", index, "must be a string or object");
    }

    const id = requiredAssetSyncId(item.id, "character", "links.characters", index);
    const name = requiredAssetSyncString(item.name, "links.characters", index, "name");
    const constraints = stringArray(item.constraints);

    return [{
      id,
      name,
      role: optionalString(item.role),
      traits: stringArray(item.traits),
      current_state: optionalString(item.current_state),
      notes: uniqueStringArray([...constraints, ...stringArray(item.notes)]),
    }];
  }), mergeAssetSyncCharacters);
}

function normalizeAssetLinkTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [];
    }
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("links.timeline_events", index, "must be a string or object");
    }

    const id = requiredAssetSyncId(
      item.id,
      "timeline_event",
      "links.timeline_events",
      index,
    );
    const description = optionalString(item.description);

    return [{
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(description, "links.timeline_events", index, "title"),
      summary: optionalString(item.summary) ?? description,
      notes: uniqueStringArray([optionalString(item.date), ...stringArray(item.notes)]),
    }];
  }), mergeAssetSyncTimelineEvents);
}

function normalizeAssetLinkHooks(value: unknown): AssetSyncHook[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [];
    }
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("links.hooks", index, "must be a string or object");
    }

    const id = requiredAssetSyncId(item.id, "hook", "links.hooks", index);
    const description = optionalString(item.description);

    return [{
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(description, "links.hooks", index, "title"),
      status: optionalString(item.status),
      summary: optionalString(item.summary) ?? description,
      notes: uniqueStringArray([
        optionalString(item.new_evidence),
        optionalString(item.chapter_reference)
          ? `chapter_reference: ${optionalString(item.chapter_reference)}`
          : null,
        ...stringArray(item.notes),
      ]),
    }];
  }), mergeAssetSyncHooks);
}

function normalizeAssetUpdateCharacters(value: unknown): AssetSyncCharacter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("updates.characters", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "character", "updates.characters", index);
    const name = optionalString(item.name);
    if (!name) {
      return [];
    }

    return [{
      id,
      name,
      role: optionalString(item.role),
      traits: stringArray(item.traits),
      current_state: optionalString(item.current_state),
      notes: stringArray(item.note ?? item.notes),
    }];
  }), mergeAssetSyncCharacters);
}

function normalizeAssetUpdateTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("updates.timeline_events", index, "must be an object");
    }

    const id = requiredAssetSyncId(
      item.id,
      "timeline_event",
      "updates.timeline_events",
      index,
    );
    const description = optionalString(item.description);

    return [{
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        requiredAssetSyncString(description, "updates.timeline_events", index, "title"),
      summary: optionalString(item.summary) ?? description,
      notes: uniqueStringArray([optionalString(item.date), ...stringArray(item.notes)]),
    }];
  }), mergeAssetSyncTimelineEvents);
}

function normalizeAssetUpdateHooks(value: unknown): AssetSyncHook[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return mergeById(value.flatMap((item, index) => {
    if (!isPlainRecord(item)) {
      throw invalidAssetSyncItem("updates.hooks", index, "must be an object");
    }

    const id = requiredAssetSyncId(item.id, "hook", "updates.hooks", index);
    const evidence = optionalString(item.new_evidence);

    return [{
      id,
      title:
        optionalString(item.title) ??
        optionalString(item.name) ??
        optionalString(item.note) ??
        optionalString(item.summary) ??
        evidence ??
        id,
      status: optionalString(item.status) ?? optionalString(item.action),
      summary: optionalString(item.summary) ?? optionalString(item.note) ?? evidence,
      notes: uniqueStringArray([evidence, ...stringArray(item.notes)]),
    }];
  }), mergeAssetSyncHooks);
}

function assetReferenceArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];

  return uniqueStringArray(
    values
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (isPlainRecord(item)) {
          return optionalString(item.id) ?? optionalString(item.name) ?? "";
        }

        return "";
      })
      .filter((item) => item.length > 0),
  );
}

function stringArray(value: unknown): string[] {
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

function uniqueStringArray(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .slice(0, 100);
}

function mergeById<T extends { id: string }>(
  items: T[],
  merge: (left: T, right: T) => T,
): T[] {
  const byId = new Map<string, T>();
  const result = [];

  for (const item of items) {
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, merge(existing, item));
      continue;
    }

    byId.set(item.id, item);
    result.push(item);
  }

  return result.map((item) => byId.get(item.id) ?? item);
}

function mergeAssetSyncCharacters(
  left: AssetSyncCharacter,
  right: AssetSyncCharacter,
): AssetSyncCharacter {
  return {
    id: left.id,
    name: left.name || right.name,
    role: left.role ?? right.role,
    traits: uniqueStringArray([...left.traits, ...right.traits]),
    current_state: right.current_state ?? left.current_state,
    notes: uniqueStringArray([...left.notes, ...right.notes]),
  };
}

function mergeAssetSyncTimelineEvents(
  left: AssetSyncTimelineEvent,
  right: AssetSyncTimelineEvent,
): AssetSyncTimelineEvent {
  return {
    id: left.id,
    title: left.title || right.title,
    summary: right.summary ?? left.summary,
    notes: uniqueStringArray([...left.notes, ...right.notes]),
  };
}

function mergeAssetSyncHooks(left: AssetSyncHook, right: AssetSyncHook): AssetSyncHook {
  return {
    id: left.id,
    title: left.title || right.title,
    status: right.status ?? left.status,
    summary: right.summary ?? left.summary,
    notes: uniqueStringArray([...left.notes, ...right.notes]),
  };
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
