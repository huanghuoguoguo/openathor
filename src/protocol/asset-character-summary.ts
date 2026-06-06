import { assetSummaryKey, isSameAssetReference } from "./asset-markdown.js";
import { characterAssetProfileCoverage } from "./asset-character-coverage.js";
import { extractAssetProfileCoverageTerms } from "./asset-coverage-terms.js";
import type {
  AssetEntity,
  ChapterCharacterProfileCoverage,
  ChapterEntityCoverage,
} from "./model.js";

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