import {
  characterAssetProfileCoverage,
  summarizeAssetCoverage,
} from "./asset-coverage.js";
import type {
  AssetAuditCatalog,
  AssetLinkCoverageIssue,
} from "./asset-audit-model.js";
import type { AssetEntity } from "./model.js";

const WEAK_CHARACTER_LINK_COVERAGE_RATIO = 0.06;
const EMPTY_CHARACTER_LINK_COVERAGE_RATIO = 0.12;
const WEAK_ASSET_LINK_COVERAGE_RATIO = 0.12;
const WEAK_ASSET_LINK_SEGMENT_RATIO = 0.5;

export function assetLinkCoverageIssuesForChapter(input: {
  chapterId: string;
  displayOrder: number;
  title: string;
  sourcePath: string | null;
  manuscriptText: string;
  linkedCharacters: string[];
  linkedTimelineEvents: string[];
  linkedHooks: string[];
  catalog: AssetAuditCatalog;
}): AssetLinkCoverageIssue[] {
  if (!input.manuscriptText.trim()) {
    return [];
  }

  const supportText = [input.title, input.manuscriptText].join("\n");
  const issues = [];

  for (const link of input.linkedCharacters) {
    const entity = input.catalog.knownCharacters.get(link);
    const issue = entity
      ? weakCharacterCoverageIssue(input, link, entity, supportText)
      : null;
    if (issue) {
      issues.push(issue);
    }
  }

  for (const link of input.linkedTimelineEvents) {
    const entity = input.catalog.knownTimelineEvents.get(link);
    const issue = entity
      ? weakAssetCoverageIssue(input, link, entity, supportText, "weak_timeline_event_link_coverage")
      : null;
    if (issue) {
      issues.push(issue);
    }
  }

  for (const link of input.linkedHooks) {
    const entity = input.catalog.knownHooks.get(link);
    const issue = entity
      ? weakAssetCoverageIssue(input, link, entity, supportText, "weak_hook_link_coverage")
      : null;
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

type ChapterLinkContext = {
  chapterId: string;
  displayOrder: number;
  title: string;
  sourcePath: string | null;
};

function weakCharacterCoverageIssue(
  chapter: ChapterLinkContext,
  link: string,
  entity: AssetEntity,
  supportText: string,
): AssetLinkCoverageIssue | null {
  if (hasDirectAssetMention(entity, supportText)) {
    return null;
  }

  const coverage = characterAssetProfileCoverage(entity, supportText);
  const weak =
    coverage.checked_fields > 0 &&
    (coverage.coverage_ratio < WEAK_CHARACTER_LINK_COVERAGE_RATIO ||
      (coverage.coverage_ratio < EMPTY_CHARACTER_LINK_COVERAGE_RATIO &&
        coverage.matched_fields === 0));

  if (!weak) {
    return null;
  }

  return {
    ...issueBase(chapter, link, entity, "weak_character_link_coverage"),
    coverage_ratio: coverage.coverage_ratio,
    segment_coverage_ratio: null,
    matched_fields: coverage.matched_fields,
    checked_fields: coverage.checked_fields,
    matched_terms: coverage.matched_terms.slice(0, 12),
    missing_terms: coverage.missing_terms.slice(0, 12),
  };
}

function weakAssetCoverageIssue(
  chapter: ChapterLinkContext,
  link: string,
  entity: AssetEntity,
  supportText: string,
  type: "weak_timeline_event_link_coverage" | "weak_hook_link_coverage",
): AssetLinkCoverageIssue | null {
  if (hasDirectAssetMention(entity, supportText)) {
    return null;
  }

  const coverageText = assetCoverageText(entity);
  if (!coverageText) {
    return null;
  }

  const coverage = summarizeAssetCoverage(coverageText, supportText);
  const weak =
    coverage.total_terms >= 6 &&
    coverage.coverage_ratio < WEAK_ASSET_LINK_COVERAGE_RATIO &&
    coverage.segment_coverage_ratio <= WEAK_ASSET_LINK_SEGMENT_RATIO;

  if (!weak) {
    return null;
  }

  return {
    ...issueBase(chapter, link, entity, type),
    coverage_ratio: coverage.coverage_ratio,
    segment_coverage_ratio: coverage.segment_coverage_ratio,
    matched_terms: coverage.matched_terms.slice(0, 12),
    missing_terms: coverage.missing_terms.slice(0, 12),
  };
}

function issueBase(
  chapter: ChapterLinkContext,
  link: string,
  entity: AssetEntity,
  type: AssetLinkCoverageIssue["type"],
): Omit<
  AssetLinkCoverageIssue,
  | "coverage_ratio"
  | "segment_coverage_ratio"
  | "matched_terms"
  | "missing_terms"
  | "matched_fields"
  | "checked_fields"
> {
  return {
    type,
    chapter_id: chapter.chapterId,
    display_order: chapter.displayOrder,
    title: chapter.title,
    source_path: chapter.sourcePath,
    link,
    asset_kind: entity.kind,
    asset_id: entity.id,
    asset_name: entity.name,
    support_text: "title_and_manuscript",
    reason: "linked_asset_weakly_supported_by_manuscript_text",
  };
}

function assetCoverageText(entity: AssetEntity): string {
  return [
    entity.name,
    ...Object.values(entity.profile).flat(),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n");
}

function hasDirectAssetMention(entity: AssetEntity, text: string): boolean {
  const normalizedText = normalizeMentionText(text);
  const normalizedName = normalizeMentionText(entity.name);

  return normalizedName.length > 0 && normalizedText.includes(normalizedName);
}

function normalizeMentionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}
