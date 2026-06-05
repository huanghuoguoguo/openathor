import {
  assetLookup,
  extractMarkdownEntities,
  stringLinks,
} from "./asset-markdown.js";
import type { AssetAuditSources } from "./asset-sources.js";
import type { EnvelopeWrite } from "./envelope.js";
import type {
  AssetSyncPackage,
  AssetSyncPlan,
  ChapterOutlineEntry,
} from "./model.js";
import { uniqueLimited } from "./value.js";

export function buildAssetSyncPlan(
  syncPackage: AssetSyncPackage,
  assetFiles: AssetAuditSources,
  targetOutline: ChapterOutlineEntry | null,
): AssetSyncPlan {
  const existingCharacters = assetLookup(
    extractMarkdownEntities(assetFiles.characters.text, "bible/characters.md", "character"),
  );
  const existingTimelineEvents = assetLookup(
    extractMarkdownEntities(
      assetFiles.timeline.text,
      "bible/timeline.md",
      "timeline_event",
    ),
  );
  const existingHooks = assetLookup(
    extractMarkdownEntities(assetFiles.hooks.text, "notes/hooks.md", "hook"),
  );
  const targetLinks = targetOutline?.links ?? {};
  const currentLinks = {
    characters: stringLinks(targetLinks.characters),
    timeline_events: stringLinks(targetLinks.timeline_events),
    hooks: stringLinks(targetLinks.hooks),
  };
  const outlineLinks = {
    characters: uniqueLimited(
      [...currentLinks.characters, ...syncPackage.chapter.links.characters],
      100,
    ),
    timeline_events: uniqueLimited(
      [...currentLinks.timeline_events, ...syncPackage.chapter.links.timeline_events],
      100,
    ),
    hooks: uniqueLimited([...currentLinks.hooks, ...syncPackage.chapter.links.hooks], 100),
  };

  const summaryModified =
    Boolean(syncPackage.chapter.summary) &&
    syncPackage.chapter.summary !== (targetOutline?.summary ?? null);
  const linksModified =
    outlineLinks.characters.join("\u0000") !== currentLinks.characters.join("\u0000") ||
    outlineLinks.timeline_events.join("\u0000") !==
      currentLinks.timeline_events.join("\u0000") ||
    outlineLinks.hooks.join("\u0000") !== currentLinks.hooks.join("\u0000");

  return {
    package: syncPackage,
    new_characters: syncPackage.characters.filter(
      (item) => !existingCharacters.has(item.id) && !existingCharacters.has(item.name),
    ),
    existing_characters: syncPackage.characters.filter(
      (item) => existingCharacters.has(item.id) || existingCharacters.has(item.name),
    ),
    new_timeline_events: syncPackage.timeline_events.filter(
      (item) => !existingTimelineEvents.has(item.id) && !existingTimelineEvents.has(item.title),
    ),
    existing_timeline_events: syncPackage.timeline_events.filter(
      (item) => existingTimelineEvents.has(item.id) || existingTimelineEvents.has(item.title),
    ),
    new_hooks: syncPackage.hooks.filter(
      (item) => !existingHooks.has(item.id) && !existingHooks.has(item.title),
    ),
    existing_hooks: syncPackage.hooks.filter(
      (item) => existingHooks.has(item.id) || existingHooks.has(item.title),
    ),
    outline_links: outlineLinks,
    outline_modified: summaryModified || linksModified,
  };
}

export function assetSyncWrites(
  confirm: boolean,
  plan: AssetSyncPlan,
  runRelPath: string,
  proposalRelPath: string,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: runRelPath,
      change_type: "created",
      reason: "assets_sync_run_record",
    },
  ];

  if (!confirm) {
    writes.push({
      path: proposalRelPath,
      change_type: "modified",
      reason: "assets_sync_pending_proposal",
    });
    return writes;
  }

  if (plan.new_characters.length > 0) {
    upsertWriteReason(writes, "bible/characters.md", "assets_sync_confirmed_character_profiles");
  }

  if (plan.new_timeline_events.length > 0) {
    upsertWriteReason(writes, "bible/timeline.md", "assets_sync_confirmed_timeline_events");
  }

  if (plan.new_hooks.length > 0) {
    upsertWriteReason(writes, "notes/hooks.md", "assets_sync_confirmed_hooks");
  }

  if (plan.outline_modified) {
    writes.push({
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "assets_sync_chapter_outline_links",
    });
  }

  if (plan.existing_characters.length > 0) {
    upsertWriteReason(writes, "bible/characters.md", "assets_sync_confirmed_character_profiles");
  }

  if (plan.existing_timeline_events.length > 0) {
    upsertWriteReason(writes, "bible/timeline.md", "assets_sync_confirmed_timeline_events");
  }

  if (plan.existing_hooks.length > 0) {
    upsertWriteReason(writes, "notes/hooks.md", "assets_sync_confirmed_hooks");
  }

  return writes;
}

export function assetSyncSummary(plan: AssetSyncPlan): Record<string, number | boolean> {
  return {
    package_characters: plan.package.characters.length,
    package_timeline_events: plan.package.timeline_events.length,
    package_hooks: plan.package.hooks.length,
    new_characters: plan.new_characters.length,
    new_timeline_events: plan.new_timeline_events.length,
    new_hooks: plan.new_hooks.length,
    existing_characters: plan.existing_characters.length,
    existing_timeline_events: plan.existing_timeline_events.length,
    existing_hooks: plan.existing_hooks.length,
    outline_modified: plan.outline_modified,
  };
}

function upsertWriteReason(
  writes: EnvelopeWrite[],
  pathValue: string,
  reason: string,
): void {
  if (writes.some((write) => write.path === pathValue)) {
    return;
  }

  writes.push({
    path: pathValue,
    change_type: "modified",
    reason,
  });
}
