import {
  assetLookup,
  extractMarkdownEntities,
  stringLinks,
} from "./asset-markdown.js";
import { readAssetAuditSources } from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import type {
  AssetEntity,
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
} from "./model.js";
import type { ProjectInspection } from "./project-inspection.js";

type AssetImpactRow = {
  link: string;
  id: string | null;
  name: string;
  source_path: string;
  line: number;
  profile_fields: string[];
};

export type StoryAssetImpact = {
  linked_assets: {
    characters: AssetImpactRow[];
    timeline_events: AssetImpactRow[];
    hooks: AssetImpactRow[];
  };
  unknown_links: {
    characters: string[];
    timeline_events: string[];
    hooks: string[];
  };
  following_asset_references: Array<{
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    source_path: string | null;
    links: {
      characters: string[];
      timeline_events: string[];
      hooks: string[];
    };
  }>;
};

export async function buildStoryAssetImpact(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  targetChapter: ChapterOutlineEntry | null;
  sourceMap: Map<string, EnvelopeSource>;
}): Promise<StoryAssetImpact> {
  const targetLinks = input.targetChapter?.links ?? {};
  const characterLinks = stringLinks(targetLinks.characters);
  const timelineLinks = stringLinks(targetLinks.timeline_events);
  const hookLinks = stringLinks(targetLinks.hooks);
  const assetFiles = await readAssetAuditSources(input.projectRoot, input.sourceMap);
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
  const hooks = extractMarkdownEntities(assetFiles.hooks.text, "notes/hooks.md", "hook");
  const knownCharacters = assetLookup(characters);
  const knownTimelineEvents = assetLookup(timelineEvents);
  const knownHooks = assetLookup(hooks);

  return {
    linked_assets: {
      characters: assetImpactRows(characterLinks, knownCharacters),
      timeline_events: assetImpactRows(timelineLinks, knownTimelineEvents),
      hooks: assetImpactRows(hookLinks, knownHooks),
    },
    unknown_links: {
      characters: unknownAssetLinks(characterLinks, knownCharacters),
      timeline_events: unknownAssetLinks(timelineLinks, knownTimelineEvents),
      hooks: unknownAssetLinks(hookLinks, knownHooks),
    },
    following_asset_references: followingAssetReferences({
      chapters: input.inspection.chapters,
      manuscriptIndex: input.inspection.manuscriptIndex,
      targetDisplayOrder: input.targetChapter?.display_order ?? 0,
      characterLinks,
      timelineLinks,
      hookLinks,
    }),
  };
}

function assetImpactRows(
  links: string[],
  lookup: Map<string, AssetEntity>,
): AssetImpactRow[] {
  return links
    .map((link) => {
      const entity = lookup.get(link);
      if (!entity) {
        return null;
      }

      return {
        link,
        id: entity.id,
        name: entity.name,
        source_path: entity.source_path,
        line: entity.line,
        profile_fields: Object.keys(entity.profile).sort(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function unknownAssetLinks(links: string[], lookup: Map<string, AssetEntity>): string[] {
  return links.filter((link) => !lookup.has(link));
}

function followingAssetReferences(input: {
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
  targetDisplayOrder: number;
  characterLinks: string[];
  timelineLinks: string[];
  hookLinks: string[];
}): StoryAssetImpact["following_asset_references"] {
  const indexedById = new Map(
    input.manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  return input.chapters.chapters
    .filter((chapter) => chapter.display_order > input.targetDisplayOrder)
    .map((chapter) => {
      const links = {
        characters: intersectLinks(stringLinks(chapter.links?.characters), input.characterLinks),
        timeline_events: intersectLinks(
          stringLinks(chapter.links?.timeline_events),
          input.timelineLinks,
        ),
        hooks: intersectLinks(stringLinks(chapter.links?.hooks), input.hookLinks),
      };

      if (
        links.characters.length === 0 &&
        links.timeline_events.length === 0 &&
        links.hooks.length === 0
      ) {
        return null;
      }

      return {
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        status: chapter.status,
        source_path: indexedById.get(chapter.id)?.source_path ?? chapter.manuscript_path ?? null,
        links,
      };
    })
    .filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== null)
    .sort((a, b) => a.display_order - b.display_order)
    .slice(0, 20);
}

function intersectLinks(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((link) => rightSet.has(link));
}
