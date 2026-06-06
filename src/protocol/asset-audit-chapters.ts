import { assetLinkCoverageIssuesForChapter } from "./asset-audit-link-coverage.js";
import type {
  AssetAuditCatalog,
  AssetAuditState,
} from "./asset-audit-model.js";
import {
  stringLinks,
} from "./asset-markdown.js";
import {
  recordCharacterSummaryTexts,
  recordLinkedAssets,
} from "./asset-audit-chapter-links.js";
import {
  type AssetAuditChapterContext,
  readAssetAuditChapterContext,
} from "./asset-audit-chapter-context.js";
import { recordLinkedCharacterProfileCoverage } from "./asset-audit-chapter-profile.js";
import { recordChapterSummaryDrift } from "./asset-audit-summary-drift.js";
import type { ProjectInspection } from "./project-inspection.js";

export { readAssetAuditChapterContext };
export type { AssetAuditChapterContext };

export function auditAssetChapter(input: {
  context: AssetAuditChapterContext;
  catalog: AssetAuditCatalog;
  state: AssetAuditState;
  maxChars: number;
}): void {
  const { chapter, sourcePath, chapterText, fullText } = input.context;
  const mentionedCharacters = input.catalog.characters
    .filter((entity) => fullText.includes(entity.name))
    .map((entity) => entity.name);
  const linkedCharacters = stringLinks(chapter.links?.characters);
  const linkedTimelineEvents = stringLinks(chapter.links?.timeline_events);
  const linkedHooks = stringLinks(chapter.links?.hooks);
  const linkedCharacterNames = linkedCharacters.map(
    (name) => input.catalog.knownCharacters.get(name)?.name ?? name,
  );
  const missingCharacterLinks = mentionedCharacters.filter(
    (name) => !linkedCharacters.includes(name) && !linkedCharacterNames.includes(name),
  );

  recordLinkedAssets({
    linkedAssetRefs: input.state.linkedAssetRefs,
    outlineLinkIssues: input.state.outlineLinkIssues,
    links: linkedCharacters,
    lookup: input.catalog.knownCharacters,
    chapter,
    type: "unknown_character",
    label: "character",
  });
  recordLinkedAssets({
    linkedAssetRefs: input.state.linkedAssetRefs,
    outlineLinkIssues: input.state.outlineLinkIssues,
    links: linkedTimelineEvents,
    lookup: input.catalog.knownTimelineEvents,
    chapter,
    type: "unknown_timeline_event",
    label: "timeline event",
  });
  recordLinkedAssets({
    linkedAssetRefs: input.state.linkedAssetRefs,
    outlineLinkIssues: input.state.outlineLinkIssues,
    links: linkedHooks,
    lookup: input.catalog.knownHooks,
    chapter,
    type: "unknown_hook",
    label: "hook",
  });

  if (mentionedCharacters.length > 0 || linkedCharacters.length > 0) {
    input.state.chapterEntityCoverage.push({
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

  recordCharacterSummaryTexts({
    catalog: input.catalog,
    state: input.state,
    linkedCharacters,
    mentionedCharacters,
    fullText,
  });
  recordLinkedCharacterProfileCoverage({
    catalog: input.catalog,
    state: input.state,
    chapter,
    sourcePath,
    chapterText,
    linkedCharacters,
  });
  recordChapterSummaryDrift({
    state: input.state,
    chapter,
    sourcePath,
    chapterText,
    maxChars: input.maxChars,
  });

  input.state.assetLinkCoverageIssues.push(
    ...assetLinkCoverageIssuesForChapter({
      chapterId: chapter.id,
      displayOrder: chapter.display_order,
      title: chapter.title,
      sourcePath,
      manuscriptText: chapterText,
      linkedCharacters,
      linkedTimelineEvents,
      linkedHooks,
      catalog: input.catalog,
    }),
  );
}