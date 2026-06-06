import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  characterAssetProfileCoverage,
  summarizeAssetCoverage,
  summarizeCharacterProfileCoverage,
} from "./asset-coverage.js";
import {
  addLinkedAssetRef,
  assetLookup,
  assetSummaryKey,
  extractMarkdownEntities,
  isSameAssetReference,
  stringLinks,
} from "./asset-markdown.js";
import type { AssetAuditSources } from "./asset-sources.js";
import { PROTOCOL_VERSION } from "./constants.js";
import type { EnvelopeWarning } from "./envelope.js";
import type {
  ChapterCharacterProfileCoverage,
  ChapterEntityCoverage,
} from "./model.js";
import type { ProjectInspection } from "./project-inspection.js";
import { snippetAround } from "./text-analysis.js";

export type AssetAuditResult = {
  warnings: EnvelopeWarning[];
  data: Record<string, unknown>;
};

export async function buildAssetAuditResult(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  assetFiles: AssetAuditSources;
  maxChars: number;
}): Promise<AssetAuditResult> {
  const { projectRoot, inspection, assetFiles, maxChars } = input;
  const characters = extractMarkdownEntities(
    assetFiles.characters.text,
    "bible/characters.md",
    "character",
  );
  const timelineEvents = extractMarkdownEntities(
    assetFiles.timeline.text,
    "bible/timeline.md",
    "timeline_event",
  );
  const hooks = extractMarkdownEntities(
    assetFiles.hooks.text,
    "notes/hooks.md",
    "hook",
  );
  const worldEntities = extractMarkdownEntities(
    assetFiles.world.text,
    "bible/world.md",
    "world",
  );
  const knownCharacters = assetLookup(characters);
  const knownTimelineEvents = assetLookup(timelineEvents);
  const knownHooks = assetLookup(hooks);
  const linkedAssetRefs = new Set<string>();
  const outlineLinkIssues = [];
  const chapterEntityCoverage: ChapterEntityCoverage[] = [];
  const characterProfileCoverage: ChapterCharacterProfileCoverage[] = [];
  const characterProfileSummaryTexts = new Map<string, string[]>();
  const summaryDrift = [];

  for (const chapter of [...inspection.chapters.chapters].sort(
    (a, b) => a.display_order - b.display_order,
  )) {
    const indexedChapter =
      inspection.manuscriptIndex.chapters.find((candidate) => candidate.id === chapter.id) ??
      null;
    const sourcePath = indexedChapter?.source_path ?? chapter.manuscript_path ?? null;
    const chapterText = sourcePath
      ? await readFile(path.join(projectRoot, sourcePath), "utf8")
      : "";
    const fullText = [chapter.title, chapter.summary ?? "", chapterText].join("\n");
    const mentionedCharacters = characters
      .filter((entity) => fullText.includes(entity.name))
      .map((entity) => entity.name);
    const linkedCharacters = stringLinks(chapter.links?.characters);
    const linkedCharacterNames = linkedCharacters.map(
      (name) => knownCharacters.get(name)?.name ?? name,
    );
    const missingCharacterLinks = mentionedCharacters.filter(
      (name) => !linkedCharacters.includes(name) && !linkedCharacterNames.includes(name),
    );

    for (const name of linkedCharacters) {
      addLinkedAssetRef(linkedAssetRefs, knownCharacters.get(name), name);
      if (!knownCharacters.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_character",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown character ${name}.`,
        });
      }
    }

    for (const name of stringLinks(chapter.links?.timeline_events)) {
      addLinkedAssetRef(linkedAssetRefs, knownTimelineEvents.get(name), name);
      if (!knownTimelineEvents.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_timeline_event",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown timeline event ${name}.`,
        });
      }
    }

    for (const name of stringLinks(chapter.links?.hooks)) {
      addLinkedAssetRef(linkedAssetRefs, knownHooks.get(name), name);
      if (!knownHooks.has(name)) {
        outlineLinkIssues.push({
          type: "unknown_hook",
          chapter_id: chapter.id,
          display_order: chapter.display_order,
          link: name,
          message: `Chapter ${chapter.id} links unknown hook ${name}.`,
        });
      }
    }

    if (mentionedCharacters.length > 0 || linkedCharacters.length > 0) {
      chapterEntityCoverage.push({
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        source_path: sourcePath,
        linked_characters: linkedCharacters,
        linked_character_names: linkedCharacterNames,
        mentioned_characters: mentionedCharacters,
        missing_character_links: missingCharacterLinks,
      });
    }

    for (const character of characters) {
      const linked = linkedCharacters.some((link) => isSameAssetReference(link, character));
      const mentioned = mentionedCharacters.includes(character.name);

      if (linked || mentioned) {
        const key = assetSummaryKey(character);
        characterProfileSummaryTexts.set(key, [
          ...(characterProfileSummaryTexts.get(key) ?? []),
          fullText,
        ]);
      }
    }

    for (const link of linkedCharacters) {
      const character = knownCharacters.get(link);

      if (!character) {
        continue;
      }

      const profileCoverage = characterAssetProfileCoverage(
        character,
        [chapter.title, chapter.summary ?? "", chapterText].join("\n"),
      );

      if (profileCoverage.checked_fields > 0) {
        characterProfileCoverage.push({
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          character_id: character.id,
          character_name: character.name,
          source_path: sourcePath,
          ...profileCoverage,
        });
      }
    }

    if (chapter.summary && chapterText) {
      const summaryCoverage = summarizeAssetCoverage(chapter.summary, chapterText);
      const weakTermCoverage =
        summaryCoverage.total_terms >= 8 &&
        summaryCoverage.coverage_ratio < 0.22 &&
        summaryCoverage.segment_coverage_ratio < 0.4;
      const assertionDrift = summaryCoverage.assertion_drift_terms.length > 0;

      if (weakTermCoverage || assertionDrift) {
        summaryDrift.push({
          id: chapter.id,
          display_order: chapter.display_order,
          title: chapter.title,
          source_path: sourcePath,
          summary_coverage_ratio: summaryCoverage.coverage_ratio,
          summary_segment_coverage_ratio: summaryCoverage.segment_coverage_ratio,
          summary_drift_reasons: [
            weakTermCoverage ? "weak_term_coverage" : null,
            assertionDrift ? "unsupported_summary_assertion" : null,
          ].filter((reason): reason is string => reason !== null),
          summary_assertion_drift_terms: summaryCoverage.assertion_drift_terms,
          summary_matched_terms: summaryCoverage.matched_terms.slice(0, 12),
          summary_missing_terms: summaryCoverage.missing_terms.slice(0, 12),
          summary_excerpt: snippetAround(chapter.summary, 0, 0, maxChars),
        });
      }
    }
  }

  const unlinkedCharacters = characters
    .filter(
      (entity) =>
        !linkedAssetRefs.has(entity.name) && (!entity.id || !linkedAssetRefs.has(entity.id)),
    )
    .map((entity) => ({
      name: entity.name,
      id: entity.id,
      source_path: entity.source_path,
      line: entity.line,
    }));
  const warnings = [...inspection.warnings];

  if (outlineLinkIssues.length > 0) {
    warnings.push({
      code: "OA_ASSET_LINK_UNRESOLVED",
      message: `Found ${outlineLinkIssues.length} outline link(s) that do not resolve to known longform assets.`,
      severity: "medium",
    });
  }

  const missingCoverageCount = chapterEntityCoverage.reduce(
    (count, chapter) => count + chapter.missing_character_links.length,
    0,
  );
  if (missingCoverageCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_LINK_DRIFT",
      message: `Found ${missingCoverageCount} character mention(s) in chapter context without matching outline links.`,
      severity: "low",
    });
  }

  if (summaryDrift.length > 0) {
    warnings.push({
      code: "OA_ASSET_SUMMARY_DRIFT",
      message: `Found ${summaryDrift.length} chapter summary candidate(s) whose terms are weakly represented in manuscript text.`,
      severity: "low",
    });
  }

  const weakProfileCoverageCount = characterProfileCoverage.filter(
    isWeakChapterProfileCoverage,
  ).length;
  const characterProfileSummary = summarizeCharacterProfileCoverage(
    characters,
    chapterEntityCoverage,
    characterProfileCoverage,
    characterProfileSummaryTexts,
  );
  const weakCharacterProfileSummaryCount = characterProfileSummary.filter(
    isWeakCharacterProfileSummary,
  ).length;

  if (weakCharacterProfileSummaryCount > 0) {
    warnings.push({
      code: "OA_ASSET_CHARACTER_PROFILE_WEAK",
      message: `Found ${weakCharacterProfileSummaryCount} character profile summary candidate(s) with weak manuscript coverage across linked chapters.`,
      severity: "low",
    });
  }

  return {
    warnings,
    data: {
      audit: {
        version: PROTOCOL_VERSION,
        generated_at: new Date().toISOString(),
        method: "deterministic_asset_outline_text_scan",
        read_only: true,
        asset_files: Object.fromEntries(
          Object.entries(assetFiles).map(([key, value]) => [
            key,
            {
              path: value.path,
              hash: value.hash,
              present: value.hash !== null,
              char_count: value.text.length,
            },
          ]),
        ),
        assets: {
          characters,
          timeline_events: timelineEvents,
          hooks,
          world: worldEntities,
        },
        counts: {
          chapters: inspection.chapters.chapters.length,
          indexed_chapters: inspection.manuscriptIndex.chapters.length,
          characters: characters.length,
          timeline_events: timelineEvents.length,
          hooks: hooks.length,
          world_entries: worldEntities.length,
          unresolved_outline_links: outlineLinkIssues.length,
          character_link_drifts: missingCoverageCount,
          weak_character_profile_coverages: weakProfileCoverageCount,
          weak_character_profile_summaries: weakCharacterProfileSummaryCount,
          summary_drift_candidates: summaryDrift.length,
          unlinked_characters: unlinkedCharacters.length,
        },
        outline_link_issues: outlineLinkIssues,
        chapter_entity_coverage: chapterEntityCoverage,
        character_profile_coverage: characterProfileCoverage,
        character_profile_summary: characterProfileSummary,
        summary_drift: summaryDrift,
        unlinked_characters: unlinkedCharacters,
      },
      recommendations: [
        "Run this audit after Pi writes or revises longform assets.",
        "Resolve unknown outline links before relying on chapter context.",
        "When chapter text introduces recurring people, add them to bible/characters.md and outline links.",
        "Treat summary drift as a review prompt, not an automatic edit.",
      ],
    },
  };
}

function isWeakChapterProfileCoverage(coverage: ChapterCharacterProfileCoverage): boolean {
  return coverage.coverage_ratio < 0.12 && coverage.matched_fields === 0;
}

function isWeakCharacterProfileSummary(
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
