import type {
  AssetSyncCharacter,
  AssetSyncHook,
  AssetSyncTimelineEvent,
} from "./model.js";

export function assetSyncCharactersMarkdown(characters: AssetSyncCharacter[]): string {
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

export function assetSyncTimelineMarkdown(events: AssetSyncTimelineEvent[]): string {
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

export function assetSyncHooksMarkdown(hooks: AssetSyncHook[]): string {
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
