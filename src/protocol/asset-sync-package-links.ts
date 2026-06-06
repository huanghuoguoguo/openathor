import {
  mergeAssetSyncCharacters,
  mergeAssetSyncHooks,
  mergeAssetSyncTimelineEvents,
  mergeById,
} from "./asset-sync-package-merge.js";
import {
  invalidAssetSyncItem,
  requiredAssetSyncId,
  requiredAssetSyncString,
  stringArray,
  uniqueStringArray,
} from "./asset-sync-package-values.js";
import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";
import { isPlainRecord, optionalString } from "./value.js";

export function normalizeAssetLinkCharacters(value: unknown): AssetSyncCharacter[] {
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

export function normalizeAssetLinkTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
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

export function normalizeAssetLinkHooks(value: unknown): AssetSyncHook[] {
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

export function assetReferenceArray(value: unknown): string[] {
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
