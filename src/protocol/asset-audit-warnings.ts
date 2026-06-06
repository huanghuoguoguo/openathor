import type { EnvelopeWarning } from "./envelope.js";
import type { ChapterCharacterProfileCoverage } from "./model.js";
import type { summarizeCharacterProfileCoverage } from "./asset-coverage.js";

export function buildAssetAuditWarnings(input: {
  inspectionWarnings: EnvelopeWarning[];
  outlineLinkIssueCount: number;
  missingCoverageCount: number;
  summaryDriftCount: number;
  weakCharacterProfileSummaryCount: number;
  assetLinkCoverageIssueCount: number;
}): EnvelopeWarning[] {
  const warnings = [...input.inspectionWarnings];

  if (input.outlineLinkIssueCount > 0) {
    warnings.push({
      code: "OA_ASSET_LINK_UNRESOLVED",
      message: `Found ${input.outlineLinkIssueCount} outline link(s) that do not resolve to known longform assets.`,
      severity: "medium",
    });
  }

  if (input.missingCoverageCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_LINK_DRIFT",
      message: `Found ${input.missingCoverageCount} character mention(s) in chapter context without matching outline links.`,
      severity: "low",
    });
  }

  if (input.assetLinkCoverageIssueCount > 0) {
    warnings.push({
      code: "OA_ASSET_LINK_WEAK_COVERAGE",
      message: `Found ${input.assetLinkCoverageIssueCount} linked asset(s) weakly represented in current manuscript text.`,
      severity: "low",
    });
  }

  if (input.summaryDriftCount > 0) {
    warnings.push({
      code: "OA_ASSET_SUMMARY_DRIFT",
      message: `Found ${input.summaryDriftCount} chapter summary candidate(s) whose terms are weakly represented in manuscript text.`,
      severity: "low",
    });
  }

  if (input.weakCharacterProfileSummaryCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_PROFILE_WEAK",
      message: `Found ${input.weakCharacterProfileSummaryCount} character profile summary candidate(s) with weak manuscript coverage across linked chapters.`,
      severity: "low",
    });
  }

  return warnings;
}

export function isWeakChapterProfileCoverage(
  coverage: ChapterCharacterProfileCoverage,
): boolean {
  return coverage.coverage_ratio < 0.12 && coverage.matched_fields === 0;
}

export function isWeakCharacterProfileSummary(
  summary: ReturnType<typeof summarizeCharacterProfileCoverage>[number],
): boolean {
  const requiredMatchedFields = Math.min(2, summary.profile_field_count);

  return (
    summary.profile_field_count > 0 &&
    summary.chapters.length > 0 &&
    summary.coverage_ratio < 0.22 &&
    summary.matched_profile_field_count < requiredMatchedFields
  );
}
