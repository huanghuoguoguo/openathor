export type AssetEntity = {
  id: string | null;
  name: string;
  source_path: string;
  line: number;
  kind: "character" | "timeline_event" | "hook" | "world";
  profile: Record<string, string[]>;
};

export type ChapterEntityCoverage = {
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  linked_characters: string[];
  linked_character_names: string[];
  mentioned_characters: string[];
  missing_character_links: string[];
};

export type CharacterProfileCoverageField = {
  field: string;
  values: string[];
  total_terms: number;
  matched_terms: string[];
  missing_terms: string[];
  coverage_ratio: number;
};

export type CharacterProfileCoverage = {
  checked_fields: number;
  matched_fields: number;
  total_terms: number;
  matched_terms: string[];
  missing_terms: string[];
  coverage_ratio: number;
  fields: CharacterProfileCoverageField[];
};

export type ChapterCharacterProfileCoverage = CharacterProfileCoverage & {
  id: string;
  display_order: number;
  title: string;
  character_id: string | null;
  character_name: string;
  source_path: string | null;
};

export type AssetSyncCharacter = {
  id: string;
  name: string;
  role: string | null;
  traits: string[];
  current_state: string | null;
  notes: string[];
};

export type AssetSyncTimelineEvent = {
  id: string;
  title: string;
  summary: string | null;
  notes: string[];
};

export type AssetSyncHook = {
  id: string;
  title: string;
  status: string | null;
  summary: string | null;
  notes: string[];
};

export type AssetSyncChapterUpdate = {
  summary: string | null;
  links: {
    characters: string[];
    timeline_events: string[];
    hooks: string[];
  };
};

export type AssetSyncPackage = {
  characters: AssetSyncCharacter[];
  timeline_events: AssetSyncTimelineEvent[];
  hooks: AssetSyncHook[];
  chapter: AssetSyncChapterUpdate;
};

export type AssetSyncPlan = {
  package: AssetSyncPackage;
  new_characters: AssetSyncCharacter[];
  existing_characters: AssetSyncCharacter[];
  new_timeline_events: AssetSyncTimelineEvent[];
  existing_timeline_events: AssetSyncTimelineEvent[];
  new_hooks: AssetSyncHook[];
  existing_hooks: AssetSyncHook[];
  outline_links: AssetSyncChapterUpdate["links"];
  outline_modified: boolean;
};
