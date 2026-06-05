import {
  ASSET_PROFILE_STOP_WORDS,
  SEARCH_STOP_WORDS,
  cjkNgrams,
} from "./text-analysis.js";
import {
  assetSummaryKey,
  isSameAssetReference,
} from "./asset-markdown.js";
import type {
  AssetEntity,
  ChapterCharacterProfileCoverage,
  ChapterEntityCoverage,
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

export function summarizeCharacterProfileCoverage(
  characters: AssetEntity[],
  chapterEntityCoverage: ChapterEntityCoverage[],
  characterProfileCoverage: ChapterCharacterProfileCoverage[],
  characterProfileSummaryTexts: Map<string, string[]>,
): Array<{
  character_id: string | null;
  character_name: string;
  source_path: string;
  line: number;
  profile_field_count: number;
  matched_profile_field_count: number;
  total_terms: number;
  matched_terms: string[];
  missing_terms: string[];
  coverage_ratio: number;
  linked_chapter_count: number;
  mentioned_chapter_count: number;
  chapters: Array<{
    id: string;
    display_order: number;
    title: string;
    source_path: string | null;
    linked: boolean;
    mentioned: boolean;
    matched_fields: number;
    checked_fields: number;
    coverage_ratio: number | null;
  }>;
}> {
  return characters.map((character) => {
    const allFields = Object.entries(character.profile)
      .map(([field, values]) => ({
        field,
        values,
        terms: extractAssetProfileCoverageTerms(values.join(" ")),
      }))
      .filter((field) => field.terms.length > 0);
    const projectCoverage = characterAssetProfileCoverage(
      character,
      (characterProfileSummaryTexts.get(assetSummaryKey(character)) ?? []).join("\n"),
    );

    const chapterRows = chapterEntityCoverage
      .map((chapter) => {
        const linked = chapter.linked_characters.some((link) =>
          isSameAssetReference(link, character),
        );
        const mentioned = chapter.mentioned_characters.includes(character.name);

        if (!linked && !mentioned) {
          return null;
        }

        const coverage = characterProfileCoverage.find(
          (candidate) =>
            candidate.id === chapter.id &&
            (candidate.character_id === character.id ||
              candidate.character_name === character.name),
        );

        return {
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          source_path: chapter.source_path,
          linked,
          mentioned,
          matched_fields: coverage?.matched_fields ?? 0,
          checked_fields: coverage?.checked_fields ?? allFields.length,
          coverage_ratio: coverage?.coverage_ratio ?? null,
        };
      })
      .filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== null)
      .sort((a, b) => a.display_order - b.display_order);

    return {
      character_id: character.id,
      character_name: character.name,
      source_path: character.source_path,
      line: character.line,
      profile_field_count: allFields.length,
      matched_profile_field_count: projectCoverage.matched_fields,
      total_terms: projectCoverage.total_terms,
      matched_terms: projectCoverage.matched_terms.slice(0, 24),
      missing_terms: projectCoverage.missing_terms.slice(0, 24),
      coverage_ratio: projectCoverage.coverage_ratio,
      linked_chapter_count: chapterRows.filter((chapter) => chapter.linked).length,
      mentioned_chapter_count: chapterRows.filter((chapter) => chapter.mentioned).length,
      chapters: chapterRows,
    };
  });
}

export function summarizeAssetCoverage(
  summary: string,
  chapterText: string,
): {
  total_terms: number;
  coverage_ratio: number;
  segment_count: number;
  segment_coverage_ratio: number;
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
    matched_terms: matchedTerms,
    missing_terms: missingTerms,
  };
}

function extractAssetProfileCoverageTerms(text: string): string[] {
  return extractAssetAuditCoverageTerms(text).filter(
    (term) => !ASSET_PROFILE_STOP_WORDS.has(term),
  );
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

function extractAssetAuditCoverageTerms(text: string): string[] {
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

function normalizeAssetAuditText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}
