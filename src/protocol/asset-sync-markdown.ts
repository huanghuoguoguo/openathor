import {
  assetLookup,
  extractMarkdownEntities,
} from "./asset-markdown.js";
import {
  mergeAssetSyncCharacter,
  mergeAssetSyncHook,
  mergeAssetSyncTimelineEvent,
} from "./asset-sync-merge.js";
import {
  assetSyncCharactersMarkdown,
  assetSyncHooksMarkdown,
  assetSyncTimelineMarkdown,
} from "./asset-sync-render.js";
import { upsertAssetSyncBlocks } from "./asset-sync-upsert.js";
import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";

export function upsertAssetSyncCharactersMarkdown(
  currentText: string,
  characters: AssetSyncCharacter[],
): string {
  const existingCharacters = assetLookup(
    extractMarkdownEntities(currentText, "bible/characters.md", "character"),
  );
  const mergedCharacters = characters.map((character) =>
    mergeAssetSyncCharacter(
      character,
      existingCharacters.get(character.id) ?? existingCharacters.get(character.name),
    ),
  );

  return upsertAssetSyncBlocks(
    currentText,
    mergedCharacters,
    "Characters",
    (character) => character.id,
    (items) => assetSyncCharactersMarkdown(items),
  );
}

export function upsertAssetSyncTimelineMarkdown(
  currentText: string,
  events: AssetSyncTimelineEvent[],
): string {
  const existingEvents = assetLookup(
    extractMarkdownEntities(currentText, "bible/timeline.md", "timeline_event"),
  );
  const mergedEvents = events.map((event) =>
    mergeAssetSyncTimelineEvent(
      event,
      existingEvents.get(event.id) ?? existingEvents.get(event.title),
    ),
  );

  return upsertAssetSyncBlocks(
    currentText,
    mergedEvents,
    "Timeline",
    (event) => event.id,
    (items) => assetSyncTimelineMarkdown(items),
  );
}

export function upsertAssetSyncHooksMarkdown(
  currentText: string,
  hooks: AssetSyncHook[],
): string {
  const existingHooks = assetLookup(extractMarkdownEntities(currentText, "notes/hooks.md", "hook"));
  const mergedHooks = hooks.map((hook) =>
    mergeAssetSyncHook(hook, existingHooks.get(hook.id) ?? existingHooks.get(hook.title)),
  );

  return upsertAssetSyncBlocks(
    currentText,
    mergedHooks,
    "Hooks",
    (hook) => hook.id,
    (items) => assetSyncHooksMarkdown(items),
  );
}
