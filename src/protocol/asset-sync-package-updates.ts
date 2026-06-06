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

export function normalizeAssetUpdateCharacters(value: unknown): AssetSyncCharacter[] {
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

export function normalizeAssetUpdateTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
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

export function normalizeAssetUpdateHooks(value: unknown): AssetSyncHook[] {
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
