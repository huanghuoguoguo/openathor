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
} from "./asset-sync-package-values.js";
import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";
import { isPlainRecord, optionalString } from "./value.js";

export function normalizeAssetSyncCharacters(value: unknown): AssetSyncCharacter[] {
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

export function normalizeAssetSyncTimelineEvents(value: unknown): AssetSyncTimelineEvent[] {
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

export function normalizeAssetSyncHooks(value: unknown): AssetSyncHook[] {
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
