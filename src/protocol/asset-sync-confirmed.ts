import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  upsertAssetSyncCharactersMarkdown,
  upsertAssetSyncHooksMarkdown,
  upsertAssetSyncTimelineMarkdown,
} from "./asset-sync-markdown.js";
import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncPlan,
  AssetSyncTimelineEvent,
  ChapterOutline,
  IndexedChapter,
} from "./model.js";
import { writeYaml } from "./project-files.js";

export async function writeAssetSyncConfirmed(
  projectRoot: string,
  chapters: ChapterOutline,
  targetChapter: IndexedChapter,
  plan: AssetSyncPlan,
): Promise<void> {
  if (plan.new_characters.length > 0) {
    await writeCharactersAsset(projectRoot, plan.new_characters);
  }

  if (plan.existing_characters.length > 0) {
    await writeCharactersAsset(projectRoot, plan.existing_characters);
  }

  if (plan.new_timeline_events.length > 0) {
    await writeTimelineAsset(projectRoot, plan.new_timeline_events);
  }

  if (plan.existing_timeline_events.length > 0) {
    await writeTimelineAsset(projectRoot, plan.existing_timeline_events);
  }

  if (plan.new_hooks.length > 0) {
    await writeHooksAsset(projectRoot, plan.new_hooks);
  }

  if (plan.existing_hooks.length > 0) {
    await writeHooksAsset(projectRoot, plan.existing_hooks);
  }

  if (plan.outline_modified) {
    const updatedChapters: ChapterOutline = {
      chapters: chapters.chapters.map((chapter) =>
        chapter.id === targetChapter.id
          ? {
              ...chapter,
              status: chapter.status === "planned" ? "drafted" : chapter.status,
              summary: plan.package.chapter.summary ?? chapter.summary,
              links: {
                ...(chapter.links ?? {}),
                characters: plan.outline_links.characters,
                timeline_events: plan.outline_links.timeline_events,
                hooks: plan.outline_links.hooks,
              },
            }
          : chapter,
      ),
    };
    await writeYaml(projectRoot, "outline/chapters.yaml", updatedChapters);
  }
}

async function writeCharactersAsset(
  projectRoot: string,
  characters: AssetSyncCharacter[],
): Promise<void> {
  const charactersPath = path.join(projectRoot, "bible/characters.md");
  await writeFile(
    charactersPath,
    upsertAssetSyncCharactersMarkdown(await readFile(charactersPath, "utf8"), characters),
    "utf8",
  );
}

async function writeTimelineAsset(
  projectRoot: string,
  events: AssetSyncTimelineEvent[],
): Promise<void> {
  const timelinePath = path.join(projectRoot, "bible/timeline.md");
  await writeFile(
    timelinePath,
    upsertAssetSyncTimelineMarkdown(await readFile(timelinePath, "utf8"), events),
    "utf8",
  );
}

async function writeHooksAsset(projectRoot: string, hooks: AssetSyncHook[]): Promise<void> {
  const hooksPath = path.join(projectRoot, "notes/hooks.md");
  await writeFile(
    hooksPath,
    upsertAssetSyncHooksMarkdown(await readFile(hooksPath, "utf8"), hooks),
    "utf8",
  );
}
