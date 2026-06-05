import type {
  EnvelopeSource,
  EnvelopeWarning,
  EnvelopeWrite,
} from "./envelope.js";

export type ProjectConfig = {
  protocol_version: string;
  project: {
    id: string;
    title: string;
    language: string;
    created_at: string;
    source_policy: "plaintext";
  };
  agent: {
    primary: "pi";
    skill: string;
    skill_version: string;
  };
  paths: {
    bible: string;
    outline: string;
    manuscript: string;
    notes: string;
    reviews: string;
    runs: string;
    manuscript_index: string;
    sqlite_index: string;
    vector_index: string;
  };
  features: {
    vector_search: "optional";
    sub_agents: "optional";
  };
};

export type ChapterOutline = {
  chapters: Array<{
    id: string;
    display_order: number;
    title: string;
    status: "planned" | "drafted" | "reviewed" | "revised" | "archived";
    manuscript_path?: string;
    summary?: string;
    scenes?: string[];
    links?: Record<string, unknown>;
  }>;
};

export type ChapterOutlineEntry = ChapterOutline["chapters"][number];

export type ManuscriptIndex = {
  version: string;
  generated_at: string;
  source_mode: "created" | "adopted" | "standardized";
  chapters: IndexedChapter[];
  unclassified?: Array<{ path: string; reason: string }>;
  questions?: Array<{ id: string; path: string; question: string; reason?: string }>;
};

export type IndexedChapter = {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
  status: "existing" | "drafted" | "revised" | "archived";
  origin: "created" | "adopted" | "standardized";
  content_hash: string;
  detected_title?: string;
  confidence: "high" | "medium" | "low";
};

export type ClassifiedFile = {
  path: string;
  kind: "chapter" | "note" | "style_reference" | "scrap" | "unclassified";
  title: string;
  order: number | null;
  reason: string;
};

export type CommandResult = {
  projectRoot?: string;
  projectId?: string | null;
  sources?: EnvelopeSource[];
  writes?: EnvelopeWrite[];
  warnings?: EnvelopeWarning[];
  data?: unknown;
};

export type InitOptions = {
  targetPath?: string;
  title?: string;
  language?: string;
  dryRun?: boolean;
};

export type AdoptOptions = {
  targetPath?: string;
  dryRun?: boolean;
  confirmAmbiguous?: boolean;
};

export type DoctorOptions = {
  cwd?: string;
  strict?: boolean;
};

export type IndexRebuildOptions = {
  cwd?: string;
  dryRun?: boolean;
  vector?: boolean;
};

export type ExportOptions = {
  cwd?: string;
  format?: string;
  out?: string;
  dryRun?: boolean;
};

export type SkillInstallOptions = {
  cwd?: string;
  target?: "project" | "global";
  dryRun?: boolean;
};

export type NotImplementedOptions = {
  command: string;
  feature: string;
  hints?: string[];
};

export type StyleProfileShowOptions = {
  cwd?: string;
  maxChars?: number;
};

export type StyleAnalyzeOptions = {
  cwd?: string;
  referencePath?: string;
  profileId?: string;
  name?: string;
  permission?: string;
  sourceType?: string;
  dryRun?: boolean;
};

export type StyleProfileApplyOptions = {
  cwd?: string;
  profileId?: string;
  confirm?: boolean;
  diff?: boolean;
  dryRun?: boolean;
  baseHash?: string;
};

export type StyleCheckOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  maxChars?: number;
};

export type StyleReviseOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  goal?: string;
  text?: string;
  confirmWrite?: boolean;
  baseHash?: string;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
};

export type AssetsAuditOptions = {
  cwd?: string;
  maxChars?: number;
};

export type AssetsSyncOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  from?: string;
  confirm?: boolean;
  dryRun?: boolean;
  baseHash?: string;
};

export type ContextOptions = {
  cwd?: string;
  scope?: "project" | "chapter";
  target?: string;
  maxChars?: number;
};

export type OutlineShowOptions = {
  cwd?: string;
};

export type OutlineImpactOptions = {
  cwd?: string;
  target?: string;
  maxChars?: number;
};

export type OutlineInsertOptions = {
  cwd?: string;
  after?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

export type OutlineMoveOptions = {
  cwd?: string;
  target?: string;
  after?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

export type OutlineMergeOptions = {
  cwd?: string;
  target?: string;
  next?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
  nextBaseHash?: string;
};

export type OutlineSplitOptions = {
  cwd?: string;
  target?: string;
  atLine?: number;
  titleBefore?: string;
  titleAfter?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
};

export type OutlineReplanOptions = {
  cwd?: string;
  from?: string;
  task?: string;
  fromPackage?: string;
  confirm?: boolean;
  baseHash?: string;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
};

export type OutlineArchiveOptions = {
  cwd?: string;
  target?: string;
  keepFacts?: boolean;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  baseHash?: string;
};

export type WritingProposalKind = "plan" | "draft" | "review" | "revise" | "canon_sync";

export type WritingProposalOptions = {
  cwd?: string;
  kind: WritingProposalKind;
  target?: string;
  task?: string;
  dryRun?: boolean;
  text?: string;
  confirmWrite?: boolean;
  baseHash?: string;
};

export type SearchTextOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};

export type SearchRelatedOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  limit?: number;
  maxChars?: number;
};

export type SearchSemanticOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};

export type VectorIndexDocument = {
  path: string;
  hash: string;
  kind: string;
  title: string | null;
  terms: string[];
  vector: number[];
  preview: string;
};

export type VectorIndex = {
  schema_version: "openathor.vector_index.v1";
  generated_at: string;
  method: "deterministic_hash_embedding_v1";
  dimensions: number;
  documents: VectorIndexDocument[];
};

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

export type OutlineReplanChapterInput = {
  id: string | null;
  title: string;
  status: ChapterOutlineEntry["status"];
  summary: string | null;
  scenes: string[];
  links: Record<string, unknown> | null;
};

export type OutlineReplanPackage = {
  chapters: OutlineReplanChapterInput[];
};

export type OutlineReplanPlan = {
  package: OutlineReplanPackage;
  preserved_before: ChapterOutlineEntry[];
  replaced_chapters: ChapterOutlineEntry[];
  replacement_chapters: ChapterOutlineEntry[];
  archived_index_chapters: IndexedChapter[];
};

export type StyleMetrics = {
  char_count: number;
  sentence_count: number;
  average_sentence_chars: number;
  dialogue_line_count: number;
  dialogue_ratio: number;
  paragraph_count: number;
  average_paragraph_chars: number;
  action_detail_hits: number;
  emotion_exposition_hits: number;
};

export type ResolvedOutlineChapter = {
  input: string;
  outlineChapter: ChapterOutlineEntry | null;
  indexedChapter: IndexedChapter | null;
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
};

export type OutlineSplitSegment = {
  title: string;
  line_start: number;
  line_end: number;
  char_count: number;
  preview: string;
  starts_with_heading: boolean;
};

export type OutlineSplitPlan = {
  split_at_line: number;
  line_count: number;
  before: OutlineSplitSegment;
  after: OutlineSplitSegment;
};

export type OutlineSplitParts = OutlineSplitPlan & {
  before_text: string;
  after_text: string;
};
