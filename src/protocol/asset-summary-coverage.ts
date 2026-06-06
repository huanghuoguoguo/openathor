import {
  extractAssetAuditCoverageTerms,
  normalizeAssetAuditText,
  roundTwo,
} from "./asset-coverage-terms.js";

export function summarizeAssetCoverage(
  summary: string,
  chapterText: string,
): {
  total_terms: number;
  coverage_ratio: number;
  segment_count: number;
  segment_coverage_ratio: number;
  assertion_drift_terms: string[];
  matched_terms: string[];
  missing_terms: string[];
} {
  const summaryTerms = extractAssetAuditCoverageTerms(summary).slice(0, 80);
  const normalizedChapterText = normalizeAssetAuditText(chapterText);
  const matchedTerms = [];
  const missingTerms = [];

  for (const term of summaryTerms) {
    if (normalizedChapterText.includes(term)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  return {
    total_terms: summaryTerms.length,
    coverage_ratio:
      summaryTerms.length === 0
        ? 1
        : roundTwo(matchedTerms.length / summaryTerms.length),
    ...summarizeAssetSegmentCoverage(summary, normalizedChapterText),
    assertion_drift_terms: summaryAssertionDriftTerms(summary, normalizedChapterText),
    matched_terms: matchedTerms,
    missing_terms: missingTerms,
  };
}

function summarizeAssetSegmentCoverage(
  summary: string,
  normalizedChapterText: string,
): {
  segment_count: number;
  segment_coverage_ratio: number;
} {
  const segments = summary
    .split(/[。！？!?；;，,、]+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  let matchedSegments = 0;

  for (const segment of segments) {
    const terms = extractAssetAuditCoverageTerms(segment).slice(0, 24);
    if (terms.length === 0) {
      continue;
    }

    const matches = terms.filter((term) => normalizedChapterText.includes(term)).length;
    const requiredMatches = Math.min(3, Math.ceil(terms.length * 0.22));
    if (matches >= requiredMatches) {
      matchedSegments += 1;
    }
  }

  return {
    segment_count: segments.length,
    segment_coverage_ratio:
      segments.length === 0 ? 1 : roundTwo(matchedSegments / segments.length),
  };
}

function summaryAssertionDriftTerms(summary: string, normalizedChapterText: string): string[] {
  const driftTerms = new Set<string>();
  const normalizedSummary = normalizeAssetAuditText(summary);
  const assertionRe =
    /[\p{Script=Han}A-Za-z0-9_]{0,8}(?:不是|并非|没有|无关|无关旧账|不再|不重要|不成立|只是无关|误以为)[\p{Script=Han}A-Za-z0-9_]{0,12}/gu;
  let match = assertionRe.exec(normalizedSummary);

  while (match) {
    const assertion = match[0].replace(/^[，,。；;、但且并]+/u, "");
    if (assertion.length >= 4 && !normalizedChapterText.includes(assertion)) {
      driftTerms.add(assertion);
    }
    match = assertionRe.exec(normalizedSummary);
  }

  return [...driftTerms].slice(0, 12);
}