import type {
  AssetEntity,
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";
import { uniqueLimited } from "./value.js";

export function mergeAssetSyncCharacter(
  incoming: AssetSyncCharacter,
  existing: AssetEntity | undefined,
): AssetSyncCharacter {
  if (!existing) {
    return incoming;
  }

  const existingCurrentStates = existing.profile.current_state ?? [];
  const previousStates =
    incoming.current_state === null
      ? []
      : existingCurrentStates
          .filter((state) => state !== incoming.current_state)
          .map((state) => `previous_state: ${state}`);

  return {
    id: incoming.id,
    name: incoming.name || existing.name,
    role: incoming.role ?? firstAssetProfileValue(existing.profile.role),
    traits: uniqueLimited(
      [
        ...splitAssetSyncValues(existing.profile.traits ?? []),
        ...incoming.traits,
      ],
      50,
    ),
    current_state:
      incoming.current_state ?? firstAssetProfileValue(existing.profile.current_state),
    notes: uniqueLimited(
      [
        ...(existing.profile.notes ?? []),
        ...previousStates,
        ...incoming.notes,
      ],
      100,
    ),
  };
}

export function mergeAssetSyncTimelineEvent(
  incoming: AssetSyncTimelineEvent,
  existing: AssetEntity | undefined,
): AssetSyncTimelineEvent {
  if (!existing) {
    return incoming;
  }

  const existingSummary = firstAssetProfileValue(existing.profile.summary);
  const previousSummaries =
    incoming.summary && existingSummary && incoming.summary !== existingSummary
      ? [`previous_summary: ${existingSummary}`]
      : [];

  return {
    id: incoming.id,
    title: incoming.title || existing.name,
    summary: incoming.summary ?? existingSummary,
    notes: uniqueLimited(
      [
        ...(existing.profile.notes ?? []),
        ...previousSummaries,
        ...incoming.notes,
      ],
      100,
    ),
  };
}

export function mergeAssetSyncHook(
  incoming: AssetSyncHook,
  existing: AssetEntity | undefined,
): AssetSyncHook {
  if (!existing) {
    return incoming;
  }

  const existingStatus = firstAssetProfileValue(existing.profile.status);
  const existingSummary = firstAssetProfileValue(existing.profile.summary);
  const previousStatus =
    incoming.status && existingStatus && incoming.status !== existingStatus
      ? [`previous_status: ${existingStatus}`]
      : [];
  const previousSummaries =
    incoming.summary && existingSummary && incoming.summary !== existingSummary
      ? [`previous_summary: ${existingSummary}`]
      : [];

  return {
    id: incoming.id,
    title: incoming.title || existing.name,
    status: incoming.status ?? existingStatus,
    summary: incoming.summary ?? existingSummary,
    notes: uniqueLimited(
      [
        ...(existing.profile.notes ?? []),
        ...previousStatus,
        ...previousSummaries,
        ...incoming.notes,
      ],
      100,
    ),
  };
}

function firstAssetProfileValue(values: string[] | undefined): string | null {
  return values?.find((value) => value.trim().length > 0) ?? null;
}

function splitAssetSyncValues(values: string[]): string[] {
  return uniqueLimited(
    values.flatMap((value) =>
      value
        .split(/[、,，;；]/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
    100,
  );
}
