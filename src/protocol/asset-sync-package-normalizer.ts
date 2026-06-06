import {
  normalizeAssetSyncCharacters,
  normalizeAssetSyncHooks,
  normalizeAssetSyncTimelineEvents,
} from "./asset-sync-package-entries.js";
import {
  assetReferenceArray,
  normalizeAssetLinkCharacters,
  normalizeAssetLinkHooks,
  normalizeAssetLinkTimelineEvents,
} from "./asset-sync-package-links.js";
import {
  mergeAssetSyncCharacters,
  mergeAssetSyncHooks,
  mergeAssetSyncTimelineEvents,
  mergeById,
} from "./asset-sync-package-merge.js";
import {
  normalizeAssetUpdateCharacters,
  normalizeAssetUpdateHooks,
  normalizeAssetUpdateTimelineEvents,
} from "./asset-sync-package-updates.js";
import { OpenAthorError } from "./errors.js";
import type { AssetSyncPackage } from "./model.js";
import { isPlainRecord, optionalString } from "./value.js";

export function normalizeAssetSyncPackage(value: unknown): AssetSyncPackage {
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

  addPackageEntitiesToChapterLinks(pkg);
  rejectEmptyAssetSyncPackage(pkg);

  return pkg;
}

function addPackageEntitiesToChapterLinks(pkg: AssetSyncPackage): void {
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
}

function rejectEmptyAssetSyncPackage(pkg: AssetSyncPackage): void {
  if (
    pkg.chapter.summary ||
    pkg.chapter.links.characters.length > 0 ||
    pkg.chapter.links.timeline_events.length > 0 ||
    pkg.chapter.links.hooks.length > 0 ||
    pkg.characters.length > 0 ||
    pkg.timeline_events.length > 0 ||
    pkg.hooks.length > 0
  ) {
    return;
  }

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
