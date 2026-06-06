import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";
import { uniqueStringArray } from "./asset-sync-package-values.js";

export function mergeById<T extends { id: string }>(
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

export function mergeAssetSyncCharacters(
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

export function mergeAssetSyncTimelineEvents(
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

export function mergeAssetSyncHooks(
  left: AssetSyncHook,
  right: AssetSyncHook,
): AssetSyncHook {
  return {
    id: left.id,
    title: left.title || right.title,
    status: right.status ?? left.status,
    summary: right.summary ?? left.summary,
    notes: uniqueStringArray([...left.notes, ...right.notes]),
  };
}
