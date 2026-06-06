import type {
  EnvelopeSource,
  EnvelopeWarning,
} from "./envelope.js";
import type {
  ChapterOutline,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";

export type ProjectChecks = {
  openathor_yaml: boolean;
  protocol_version: boolean;
  required_directories: boolean;
  outline_chapters: boolean;
  manuscript_index: boolean;
  chapter_ids_unique: boolean;
  display_order_unique: boolean;
  source_paths_exist: boolean;
  standard_assets_present: boolean;
  manuscript_index_matches_outline: boolean;
  derived_index_current: boolean;
};

export type ProjectInspection = {
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
  sources: EnvelopeSource[];
  warnings: EnvelopeWarning[];
  checks: ProjectChecks;
};
