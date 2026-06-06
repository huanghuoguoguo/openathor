import { extractAssetProfileCoverageTerms, normalizeAssetAuditText, roundTwo } from "./asset-coverage-terms.js";
import type {
  AssetEntity,
  CharacterProfileCoverage,
} from "./model.js";

export function characterAssetProfileCoverage(
  character: AssetEntity,
  chapterText: string,
): CharacterProfileCoverage {
  const normalizedChapterText = normalizeAssetAuditText(chapterText);
  const fields = Object.entries(character.profile)
    .map(([field, values]) => ({
      field,
      values,
      terms: extractAssetProfileCoverageTerms(values.join(" ")),
    }))
    .filter((item) => item.terms.length > 0);
  const matchedTerms = new Set<string>();
  const missingTerms = new Set<string>();
  const fieldCoverage = [];
  let totalTerms = 0;
  let matchedFields = 0;

  for (const field of fields) {
    const matched = [];
    const missing = [];

    for (const term of field.terms) {
      if (normalizedChapterText.includes(term)) {
        matched.push(term);
        matchedTerms.add(term);
      } else {
        missing.push(term);
        missingTerms.add(term);
      }
    }

    if (matched.length > 0) {
      matchedFields += 1;
    }

    totalTerms += field.terms.length;
    fieldCoverage.push({
      field: field.field,
      values: field.values,
      total_terms: field.terms.length,
      matched_terms: matched.slice(0, 12),
      missing_terms: missing.slice(0, 12),
      coverage_ratio:
        field.terms.length === 0 ? 1 : roundTwo(matched.length / field.terms.length),
    });
  }

  return {
    checked_fields: fields.length,
    matched_fields: matchedFields,
    total_terms: totalTerms,
    matched_terms: [...matchedTerms].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).slice(0, 20),
    missing_terms: [...missingTerms].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).slice(0, 20),
    coverage_ratio: totalTerms === 0 ? 1 : roundTwo(matchedTerms.size / totalTerms),
    fields: fieldCoverage,
  };
}