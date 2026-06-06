import { summarizeAssetCoverage } from "./asset-coverage.js";
import type { AssetAuditState } from "./asset-audit-model.js";
import type { AuditChapter } from "./asset-audit-chapter-context.js";
import { snippetAround } from "./text-analysis.js";

export function recordChapterSummaryDrift(input: {
  state: AssetAuditState;
  chapter: AuditChapter;
  sourcePath: string | null;
  chapterText: string;
  maxChars: number;
}): void {
  if (!input.chapter.summary || !input.chapterText) {
    return;
  }

  const summaryCoverage = summarizeAssetCoverage(input.chapter.summary, input.chapterText);
  const weakTermCoverage =
    summaryCoverage.total_terms >= 8 &&
    summaryCoverage.coverage_ratio < 0.22 &&
    summaryCoverage.segment_coverage_ratio < 0.4;
  const assertionDrift = summaryCoverage.assertion_drift_terms.length > 0;

  if (!weakTermCoverage && !assertionDrift) {
    return;
  }

  input.state.summaryDrift.push({
    id: input.chapter.id,
    display_order: input.chapter.display_order,
    title: input.chapter.title,
    source_path: input.sourcePath,
    summary_coverage_ratio: summaryCoverage.coverage_ratio,
    summary_segment_coverage_ratio: summaryCoverage.segment_coverage_ratio,
    summary_drift_reasons: [
      weakTermCoverage ? "weak_term_coverage" : null,
      assertionDrift ? "unsupported_summary_assertion" : null,
    ].filter((reason): reason is string => reason !== null),
    summary_assertion_drift_terms: summaryCoverage.assertion_drift_terms,
    summary_matched_terms: summaryCoverage.matched_terms.slice(0, 12),
    summary_missing_terms: summaryCoverage.missing_terms.slice(0, 12),
    summary_excerpt: snippetAround(input.chapter.summary, 0, 0, input.maxChars),
  });
}