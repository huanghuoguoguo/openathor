import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assetLookup,
  extractMarkdownEntities,
  isSameAssetReference,
  stringLinks,
} from "./asset-markdown.js";
import type { AssetAuditSources } from "./asset-sources.js";
import type { EnvelopeWrite } from "./envelope.js";
import type {
  AssetEntity,
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
} from "./model.js";
import type { ProjectInspection } from "./project-inspection.js";

export type AssetLinkBackfillChange = {
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  added_character_links: string[];
  current_character_links: string[];
  next_character_links: string[];
  mentioned_characters: string[];
};

export type AssetLinkBackfillPlan = {
  kind: "characters";
  characters: AssetEntity[];
  changes: AssetLinkBackfillChange[];
  updated_outline: ChapterOutline;
};

export async function buildAssetLinkBackfillPlan(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  assetFiles: AssetAuditSources;
}): Promise<AssetLinkBackfillPlan> {
  const { projectRoot, inspection, assetFiles } = input;
  const characters = extractMarkdownEntities(
    assetFiles.characters.text,
    "bible/characters.md",
    "character",
  ).filter((character) => character.id !== null);
  const characterLookup = assetLookup(characters);
  const indexedById = new Map(
    inspection.manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );
  const changes: AssetLinkBackfillChange[] = [];
  const updatedChapters: ChapterOutlineEntry[] = [];

  for (const chapter of inspection.chapters.chapters) {
    const indexedChapter = indexedById.get(chapter.id) ?? null;
    const sourcePath = sourcePathForChapter(chapter, inspection.manuscriptIndex);
    if (chapter.status === "planned" || !sourcePath) {
      updatedChapters.push(chapter);
      continue;
    }

    const chapterText = sourcePath
      ? await readFile(path.join(projectRoot, sourcePath), "utf8")
      : "";
    const fullText = [chapter.title, chapter.summary ?? "", chapterText].join("\n");
    const currentLinks = stringLinks(chapter.links?.characters);
    const nextLinks = [...currentLinks];
    const mentioned = characters.filter((character) => fullText.includes(character.name));
    const added: string[] = [];

    for (const character of mentioned) {
      if (currentLinks.some((link) => isSameAssetReference(link, character))) {
        continue;
      }

      const link = character.id ?? character.name;
      const known = characterLookup.get(link);
      if (!known || nextLinks.some((value) => isSameAssetReference(value, character))) {
        continue;
      }

      nextLinks.push(link);
      added.push(link);
    }

    if (added.length > 0) {
      changes.push({
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        source_path: indexedChapter?.source_path ?? sourcePath,
        added_character_links: added,
        current_character_links: currentLinks,
        next_character_links: nextLinks,
        mentioned_characters: mentioned.map((character) => character.name),
      });
      updatedChapters.push({
        ...chapter,
        links: {
          ...(chapter.links ?? {}),
          characters: nextLinks,
        },
      });
      continue;
    }

    updatedChapters.push(chapter);
  }

  return {
    kind: "characters",
    characters,
    changes,
    updated_outline: {
      chapters: updatedChapters,
    },
  };
}

export function assetLinkBackfillWrites(
  confirm: boolean,
  plan: AssetLinkBackfillPlan,
  runRelPath: string,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: runRelPath,
      change_type: "created",
      reason: "Run record for deterministic asset link backfill.",
    },
  ];

  if (confirm && plan.changes.length > 0) {
    writes.unshift({
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "Backfilled chapter character links from confirmed character names.",
    });
  }

  return writes;
}

export function assetLinkBackfillResult(
  plan: AssetLinkBackfillPlan,
  confirm: boolean,
): Record<string, number | boolean> {
  return {
    chapters_scanned: plan.updated_outline.chapters.length,
    chapters_modified: plan.changes.length,
    character_links_added: plan.changes.reduce(
      (count, change) => count + change.added_character_links.length,
      0,
    ),
    confirmed_outline_written: confirm && plan.changes.length > 0,
  };
}

function sourcePathForChapter(
  chapter: ChapterOutlineEntry,
  manuscriptIndex: ManuscriptIndex,
): string | null {
  return (
    manuscriptIndex.chapters.find((candidate) => candidate.id === chapter.id)?.source_path ??
    chapter.manuscript_path ??
    null
  );
}
