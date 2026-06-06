import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  characterAssetProfileCoverage,
  summarizeAssetCoverage,
} from "./asset-coverage.js";
import { assetLinkCoverageIssuesForChapter } from "./asset-audit-link-coverage.js";
import type {
  AssetAuditCatalog,
  AssetAuditState,
  OutlineLinkIssue,
} from "./asset-audit-model.js";
import {
  addLinkedAssetRef,
  assetSummaryKey,
  isSameAssetReference,
  stringLinks,
} from "./asset-markdown.js";
import type { AssetEntity } from "./model.js";
import type { ProjectInspection } from "./project-inspection.js";
import { snippetAround } from "./text-analysis.js";

type AuditChapter = ProjectInspection["chapters"]["chapters"][number];

export type AssetAuditChapterContext = {
  chapter: AuditChapter;
  sourcePath: string | null;
  chapterText: string;
  fullText: string;
};

export async function readAssetAuditChapterContext(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  chapter: AuditChapter;
}): Promise<AssetAuditChapterContext> {
  const indexedChapter =
    input.inspection.manuscriptIndex.chapters.find(
      (candidate) => candidate.id === input.chapter.id,
    ) ?? null;
  const sourcePath = indexedChapter?.source_path ?? input.chapter.manuscript_path ?? null;
  const chapterText = sourcePath
    ? await readFile(path.join(input.projectRoot, sourcePath), "utf8")
    : "";

  return {
    chapter: input.chapter,
    sourcePath,
    chapterText,
    fullText: [input.chapter.title, input.chapter.summary ?? "", chapterText].join("\n"),
  };
}

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

function recordLinkedAssets(input: {
  linkedAssetRefs: Set<string>;
  outlineLinkIssues: OutlineLinkIssue[];
  links: string[];
  lookup: Map<string, AssetEntity>;
  chapter: AuditChapter;
  type: OutlineLinkIssue["type"];
  label: string;
}): void {
  for (const link of input.links) {
    addLinkedAssetRef(input.linkedAssetRefs, input.lookup.get(link), link);

    if (!input.lookup.has(link)) {
      input.outlineLinkIssues.push({
        type: input.type,
        chapter_id: input.chapter.id,
        display_order: input.chapter.display_order,
        link,
        message: `Chapter ${input.chapter.id} links unknown ${input.label} ${link}.`,
      });
    }
  }
}

function recordCharacterSummaryTexts(input: {
  catalog: AssetAuditCatalog;
  state: AssetAuditState;
  linkedCharacters: string[];
  mentionedCharacters: string[];
  fullText: string;
}): void {
  for (const character of input.catalog.characters) {
    const linked = input.linkedCharacters.some((link) =>
      isSameAssetReference(link, character),
    );
    const mentioned = input.mentionedCharacters.includes(character.name);

    if (linked || mentioned) {
      const key = assetSummaryKey(character);
      input.state.characterProfileSummaryTexts.set(key, [
        ...(input.state.characterProfileSummaryTexts.get(key) ?? []),
        input.fullText,
      ]);
    }
  }
}

function recordLinkedCharacterProfileCoverage(input: {
  catalog: AssetAuditCatalog;
  state: AssetAuditState;
  chapter: AuditChapter;
  sourcePath: string | null;
  chapterText: string;
  linkedCharacters: string[];
}): void {
  for (const link of input.linkedCharacters) {
    const character = input.catalog.knownCharacters.get(link);

    if (!character) {
      continue;
    }

    const profileCoverage = characterAssetProfileCoverage(
      character,
      [input.chapter.title, input.chapter.summary ?? "", input.chapterText].join("\n"),
    );

    if (profileCoverage.checked_fields > 0) {
      input.state.characterProfileCoverage.push({
        id: input.chapter.id,
        display_order: input.chapter.display_order,
        title: input.chapter.title,
        character_id: character.id,
        character_name: character.name,
        source_path: input.sourcePath,
        ...profileCoverage,
      });
    }
  }
}

function recordChapterSummaryDrift(input: {
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
