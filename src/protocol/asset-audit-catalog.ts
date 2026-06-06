import {
  assetLookup,
  extractMarkdownEntities,
} from "./asset-markdown.js";
import type { AssetAuditSources } from "./asset-sources.js";
import type { AssetAuditCatalog } from "./asset-audit-model.js";

export function buildAssetAuditCatalog(assetFiles: AssetAuditSources): AssetAuditCatalog {
  const characters = extractMarkdownEntities(
    assetFiles.characters.text,
    "bible/characters.md",
    "character",
  );
  const timelineEvents = extractMarkdownEntities(
    assetFiles.timeline.text,
    "bible/timeline.md",
    "timeline_event",
  );
  const hooks = extractMarkdownEntities(
    assetFiles.hooks.text,
    "notes/hooks.md",
    "hook",
  );
  const worldEntities = extractMarkdownEntities(
    assetFiles.world.text,
    "bible/world.md",
    "world",
  );

  return {
    characters,
    timelineEvents,
    hooks,
    worldEntities,
    knownCharacters: assetLookup(characters),
    knownTimelineEvents: assetLookup(timelineEvents),
    knownHooks: assetLookup(hooks),
  };
}
