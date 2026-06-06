import { summarizeCharacterProfileCoverage } from "./asset-coverage.js";
import { buildAssetAuditCatalog } from "./asset-audit-catalog.js";
import {
  auditAssetChapter,
  readAssetAuditChapterContext,
} from "./asset-audit-chapters.js";
import {
  createAssetAuditState,
  type AssetAuditResult,
} from "./asset-audit-model.js";
import {
  buildAssetAuditWarnings,
  isWeakChapterProfileCoverage,
  isWeakCharacterProfileSummary,
} from "./asset-audit-warnings.js";
import type { AssetAuditSources } from "./asset-sources.js";
import { PROTOCOL_VERSION } from "./constants.js";
import type { ProjectInspection } from "./project-inspection.js";

export type { AssetAuditResult } from "./asset-audit-model.js";

export async function buildAssetAuditResult(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  assetFiles: AssetAuditSources;
  maxChars: number;
}): Promise<AssetAuditResult> {
  const { projectRoot, inspection, assetFiles, maxChars } = input;
  const catalog = buildAssetAuditCatalog(assetFiles);
  const state = createAssetAuditState();
  const sortedChapters = [...inspection.chapters.chapters].sort(
    (a, b) => a.display_order - b.display_order,
  );

  for (const chapter of sortedChapters) {
    const context = await readAssetAuditChapterContext({
      projectRoot,
      inspection,
      chapter,
    });
    auditAssetChapter({
      context,
      catalog,
      state,
      maxChars,
    });
  }

  const unlinkedCharacters = catalog.characters
    .filter(
      (entity) =>
        !state.linkedAssetRefs.has(entity.name) &&
        (!entity.id || !state.linkedAssetRefs.has(entity.id)),
    )
    .map((entity) => ({
      name: entity.name,
      id: entity.id,
      source_path: entity.source_path,
      line: entity.line,
    }));
  const missingCoverageCount = state.chapterEntityCoverage.reduce(
    (count, chapter) => count + chapter.missing_character_links.length,
    0,
  );
  const weakProfileCoverageCount = state.characterProfileCoverage.filter(
    isWeakChapterProfileCoverage,
  ).length;
  const characterProfileSummary = summarizeCharacterProfileCoverage(
    catalog.characters,
    state.chapterEntityCoverage,
    state.characterProfileCoverage,
    state.characterProfileSummaryTexts,
  );
  const weakCharacterProfileSummaryCount = characterProfileSummary.filter(
    isWeakCharacterProfileSummary,
  ).length;
  const warnings = buildAssetAuditWarnings({
    inspectionWarnings: inspection.warnings,
    outlineLinkIssueCount: state.outlineLinkIssues.length,
    missingCoverageCount,
    summaryDriftCount: state.summaryDrift.length,
    weakCharacterProfileSummaryCount,
    assetLinkCoverageIssueCount: state.assetLinkCoverageIssues.length,
  });

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
          characters: catalog.characters,
          timeline_events: catalog.timelineEvents,
          hooks: catalog.hooks,
          world: catalog.worldEntities,
        },
        counts: {
          chapters: inspection.chapters.chapters.length,
          indexed_chapters: inspection.manuscriptIndex.chapters.length,
          characters: catalog.characters.length,
          timeline_events: catalog.timelineEvents.length,
          hooks: catalog.hooks.length,
          world_entries: catalog.worldEntities.length,
          unresolved_outline_links: state.outlineLinkIssues.length,
          character_link_drifts: missingCoverageCount,
          weak_asset_link_coverages: state.assetLinkCoverageIssues.length,
          weak_character_profile_coverages: weakProfileCoverageCount,
          weak_character_profile_summaries: weakCharacterProfileSummaryCount,
          summary_drift_candidates: state.summaryDrift.length,
          unlinked_characters: unlinkedCharacters.length,
        },
        outline_link_issues: state.outlineLinkIssues,
        asset_link_coverage_issues: state.assetLinkCoverageIssues,
        chapter_entity_coverage: state.chapterEntityCoverage,
        character_profile_coverage: state.characterProfileCoverage,
        character_profile_summary: characterProfileSummary,
        summary_drift: state.summaryDrift,
        unlinked_characters: unlinkedCharacters,
      },
      recommendations: [
        "Run this audit after Pi writes or revises longform assets.",
        "Resolve unknown outline links before relying on chapter context.",
        "When chapter text introduces recurring people, add them to bible/characters.md and outline links.",
        "Review weak linked-asset coverage after structural edits; copied links may need pruning or asset sync.",
        "Treat summary drift as a review prompt, not an automatic edit.",
      ],
    },
  };
}
