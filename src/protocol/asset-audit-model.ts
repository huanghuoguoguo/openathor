import type { EnvelopeWarning } from "./envelope.js";
import type {
  AssetEntity,
  ChapterCharacterProfileCoverage,
  ChapterEntityCoverage,
} from "./model.js";

export type AssetAuditResult = {
  warnings: EnvelopeWarning[];
  data: Record<string, unknown>;
};

export type AssetAuditCatalog = {
  characters: AssetEntity[];
  timelineEvents: AssetEntity[];
  hooks: AssetEntity[];
  worldEntities: AssetEntity[];
  knownCharacters: Map<string, AssetEntity>;
  knownTimelineEvents: Map<string, AssetEntity>;
  knownHooks: Map<string, AssetEntity>;
};

export type OutlineLinkIssue = {
  type: "unknown_character" | "unknown_timeline_event" | "unknown_hook";
  chapter_id: string;
  display_order: number;
  link: string;
  message: string;
};

export type SummaryDriftRecord = {
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  summary_coverage_ratio: number;
  summary_segment_coverage_ratio: number;
  summary_drift_reasons: string[];
  summary_assertion_drift_terms: string[];
  summary_matched_terms: string[];
  summary_missing_terms: string[];
  summary_excerpt: string;
};

export type AssetLinkCoverageIssue = {
  type:
    | "weak_character_link_coverage"
    | "weak_timeline_event_link_coverage"
    | "weak_hook_link_coverage";
  chapter_id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  link: string;
  asset_kind: AssetEntity["kind"];
  asset_id: string | null;
  asset_name: string;
  support_text: "title_and_manuscript";
  coverage_ratio: number;
  segment_coverage_ratio: number | null;
  matched_fields?: number;
  checked_fields?: number;
  matched_terms: string[];
  missing_terms: string[];
  reason: "linked_asset_weakly_supported_by_manuscript_text";
};

export type AssetAuditState = {
  linkedAssetRefs: Set<string>;
  outlineLinkIssues: OutlineLinkIssue[];
  chapterEntityCoverage: ChapterEntityCoverage[];
  characterProfileCoverage: ChapterCharacterProfileCoverage[];
  characterProfileSummaryTexts: Map<string, string[]>;
  summaryDrift: SummaryDriftRecord[];
  assetLinkCoverageIssues: AssetLinkCoverageIssue[];
};

export function createAssetAuditState(): AssetAuditState {
  return {
    linkedAssetRefs: new Set<string>(),
    outlineLinkIssues: [],
    chapterEntityCoverage: [],
    characterProfileCoverage: [],
    characterProfileSummaryTexts: new Map<string, string[]>(),
    summaryDrift: [],
    assetLinkCoverageIssues: [],
  };
}
