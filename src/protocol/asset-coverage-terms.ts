import {
  ASSET_PROFILE_STOP_WORDS,
  SEARCH_STOP_WORDS,
  cjkNgrams,
} from "./text-analysis.js";

export function extractAssetProfileCoverageTerms(text: string): string[] {
  return extractAssetAuditCoverageTerms(text).filter(
    (term) => !ASSET_PROFILE_STOP_WORDS.has(term),
  );
}

export function extractAssetAuditCoverageTerms(text: string): string[] {
  const terms = new Set<string>();
  const normalized = normalizeAssetAuditText(text);

  for (const token of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!SEARCH_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  for (const phrase of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (const token of cjkNgrams(phrase)) {
      if (!SEARCH_STOP_WORDS.has(token)) {
        terms.add(token);
      }
    }
  }

  return [...terms].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function normalizeAssetAuditText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

export function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}