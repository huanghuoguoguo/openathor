import {
  assetLookup,
  extractMarkdownEntities,
} from "./asset-markdown.js";
import type {
  AssetEntity,
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";
import { uniqueLimited } from "./value.js";

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

function assetSyncCharactersMarkdown(characters: AssetSyncCharacter[]): string {
  return [
    "",
    "## Characters",
    "",
    ...characters.flatMap((character) => [
      `- id: ${character.id}`,
      `  name: ${character.name}`,
      character.role ? `  role: ${character.role}` : null,
      character.traits.length > 0 ? `  traits: ${character.traits.join("、")}` : null,
      character.current_state ? `  current_state: ${character.current_state}` : null,
      ...character.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function assetSyncTimelineMarkdown(events: AssetSyncTimelineEvent[]): string {
  return [
    "",
    "## Timeline",
    "",
    ...events.flatMap((event) => [
      `- id: ${event.id}`,
      `  event: ${event.title}`,
      event.summary ? `  summary: ${event.summary}` : null,
      ...event.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function assetSyncHooksMarkdown(hooks: AssetSyncHook[]): string {
  return [
    "",
    "## Hooks",
    "",
    ...hooks.flatMap((hook) => [
      `- id: ${hook.id}`,
      `  hook: ${hook.title}`,
      hook.status ? `  status: ${hook.status}` : null,
      hook.summary ? `  summary: ${hook.summary}` : null,
      ...hook.notes.map((note) => `  note: ${note}`),
      "",
    ].filter((line): line is string => line !== null)),
  ].join("\n");
}

function mergeAssetSyncCharacter(
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

function mergeAssetSyncTimelineEvent(
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

function mergeAssetSyncHook(
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

function upsertAssetSyncBlocks<T>(
  currentText: string,
  items: T[],
  sectionTitle: string,
  idOf: (item: T) => string,
  markdownFor: (items: T[]) => string,
): string {
  const text = currentText.endsWith("\n") ? currentText : `${currentText}\n`;
  let nextText = text;
  const appendItems = [];

  for (const item of items) {
    const block = assetSyncItemBlocksMarkdown(markdownFor([item]), sectionTitle);
    const replaced = replaceAssetSyncBlock(nextText, idOf(item), block);

    if (replaced === null) {
      appendItems.push(item);
      continue;
    }

    nextText = replaced;
  }

  if (appendItems.length === 0) {
    return nextText;
  }

  return `${nextText.trimEnd()}${markdownForSection(sectionTitle, appendItems, markdownFor)}\n`;
}

function assetSyncItemBlocksMarkdown(sectionMarkdown: string, sectionTitle: string): string {
  const lines = sectionMarkdown.trim().split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(sectionTitle)}\\s*$`, "iu");
  const firstContentIndex = lines.findIndex((line, index) => {
    if (index === 0 && headingPattern.test(line.trim())) {
      return false;
    }
    return line.trim().length > 0;
  });

  return lines.slice(Math.max(firstContentIndex, 0)).join("\n").trim();
}

function markdownForSection<T>(
  sectionTitle: string,
  items: T[],
  markdownFor: (items: T[]) => string,
): string {
  const rendered = markdownFor(items).trim();
  return rendered.startsWith(`## ${sectionTitle}`) ? `\n\n${rendered}` : `\n\n## ${sectionTitle}\n\n${rendered}`;
}

function replaceAssetSyncBlock(text: string, id: string, replacementBlock: string): string | null {
  const lines = text.split(/\r?\n/);
  const idLinePattern = new RegExp(
    `^[-*]\\s+(?:\\*\\*)?id(?:\\*\\*)?\\s*[:：]\\s*\\x60?${escapeRegExp(id)}\\x60?\\s*$`,
    "iu",
  );
  const start = lines.findIndex((line) =>
    idLinePattern.test(line.trim()),
  );

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const trimmed = lines[cursor].trim();
    if (/^#{1,6}\s+/u.test(trimmed) || /^[-*]\s+(?:\*\*)?id(?:\*\*)?\s*[:：]/iu.test(trimmed)) {
      end = cursor;
      break;
    }
  }

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const replacement = replacementBlock.split(/\r?\n/);
  if (after[0]?.trim() && !/^#{1,6}\s+/u.test(after[0].trim())) {
    replacement.push("");
  }

  return [...before, ...replacement, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
