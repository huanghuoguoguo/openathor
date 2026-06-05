import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EnvelopeSource } from "./envelope.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
  ResolvedOutlineChapter,
} from "./model.js";
import { outlineTargetData } from "./outline-target.js";
import { readSourceText } from "./project-files.js";
import type { ProjectInspection } from "./project-inspection.js";
import { searchCandidatePaths } from "./retrieval-files.js";
import {
  extractSearchTerms,
  relatedScore,
  snippetAround,
} from "./text-analysis.js";
import { sha256File } from "./paths.js";

export async function buildOutlineImpactData(input: {
  projectRoot: string;
  inspection: ProjectInspection;
  target: ResolvedOutlineChapter;
  maxChars: number;
  sourceMap: Map<string, EnvelopeSource>;
}): Promise<Record<string, unknown>> {
  const { projectRoot, inspection, target, maxChars, sourceMap } = input;
  const targetSource = target.source_path
    ? await readSourceText(projectRoot, target.source_path, sourceMap)
    : null;
  const targetText = [
    target.title,
    target.outlineChapter?.summary ?? "",
    targetSource?.text ?? "",
  ].join("\n");
  const targetTerms = extractSearchTerms(targetText);
  const referenceTerms = outlineReferenceTerms(target);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const directReferences = [];
  const relatedContext = [];

  for (const relPath of relPaths) {
    if (relPath === target.source_path) {
      continue;
    }

    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const hash = await sha256File(fullPath);
    const direct = directReferenceMatch(text, referenceTerms, maxChars);

    if (direct) {
      sourceMap.set(relPath, { path: relPath, hash });
      directReferences.push({
        path: relPath,
        hash,
        matched_refs: direct.matchedRefs,
        snippet: direct.snippet,
      });
    }

    if (targetTerms.length > 0) {
      const related = relatedScore(text, targetTerms, maxChars);

      if (related.score > 0) {
        sourceMap.set(relPath, { path: relPath, hash });
        relatedContext.push({
          path: relPath,
          hash,
          score: related.score,
          shared_terms: related.sharedTerms,
          snippet: related.snippet,
        });
      }
    }
  }

  const sortedDirectReferences = directReferences.sort((a, b) =>
    a.path.localeCompare(b.path, "zh-Hans-CN"),
  );
  const sortedRelatedContext = relatedContext
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, 10);
  const followingChapters = followingOutlineChapters(
    inspection.chapters,
    inspection.manuscriptIndex,
    target.display_order,
  );
  const factCandidates = targetSource
    ? impactFactCandidates(targetSource.text, maxChars)
    : target.outlineChapter?.summary
      ? [{ line: null, text: snippetAround(target.outlineChapter.summary, 0, 0, maxChars) }]
      : [];

  return {
    scope: "chapter",
    target: outlineTargetData(target, targetSource?.hash ?? null),
    read_only: true,
    default_action: "archive_not_delete",
    method: "deterministic_text_reference_scan",
    reference_terms: referenceTerms,
    target_terms: targetTerms.slice(0, 20),
    impact: {
      manuscript_file: {
        path: target.source_path,
        hash: targetSource?.hash ?? null,
        will_be_deleted: false,
      },
      outline_status_change: {
        from: target.outline_status,
        to: "archived",
      },
      index_status_change: {
        from: target.index_status,
        to: target.indexedChapter ? "archived" : null,
      },
      structural_links: {
        scenes: target.outlineChapter?.scenes ?? [],
        links: target.outlineChapter?.links ?? {},
      },
      fact_candidates: factCandidates,
      direct_references: sortedDirectReferences,
      related_context: sortedRelatedContext,
      following_chapters: followingChapters,
    },
    match_count: sortedDirectReferences.length + sortedRelatedContext.length,
    recommendations: [
      "Ask the user before archiving this chapter.",
      "Archive the chapter instead of deleting the manuscript file.",
      "Keep confirmed canon unchanged unless the user explicitly confirms a canon edit.",
    ],
  };
}

function outlineReferenceTerms(target: ResolvedOutlineChapter): string[] {
  const terms = new Set<string>();

  for (const value of [
    target.id,
    target.title,
    target.source_path ?? "",
    target.source_path ? path.posix.basename(target.source_path) : "",
    `chapter ${target.display_order}`,
    `display_order: ${target.display_order}`,
    `第${target.display_order}章`,
    `第 ${target.display_order} 章`,
  ]) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      terms.add(trimmed);
    }
  }

  return [...terms];
}

function directReferenceMatch(
  text: string,
  referenceTerms: string[],
  maxChars: number,
): {
  matchedRefs: string[];
  snippet: string;
} | null {
  const normalized = text.toLowerCase();
  const matchedRefs = referenceTerms.filter((term) =>
    normalized.includes(term.toLowerCase()),
  );

  if (matchedRefs.length === 0) {
    return null;
  }

  const compactText = text.replace(/\s+/g, " ");
  const compactNormalized = compactText.toLowerCase();
  const firstRef = matchedRefs[0];
  const index = Math.max(0, compactNormalized.indexOf(firstRef.toLowerCase()));

  return {
    matchedRefs,
    snippet: snippetAround(compactText, index, firstRef.length, maxChars),
  };
}

function followingOutlineChapters(
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
  displayOrder: number,
): Array<{
  id: string;
  display_order: number;
  title: string;
  status: ChapterOutlineEntry["status"];
  source_path: string | null;
}> {
  const indexedById = new Map(
    manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  return chapters.chapters
    .filter(
      (chapter) => chapter.display_order > displayOrder && chapter.status !== "archived",
    )
    .sort((a, b) => a.display_order - b.display_order)
    .slice(0, 5)
    .map((chapter) => ({
      id: chapter.id,
      display_order: chapter.display_order,
      title: chapter.title,
      status: chapter.status,
      source_path: indexedById.get(chapter.id)?.source_path ?? chapter.manuscript_path ?? null,
    }));
}

function impactFactCandidates(
  text: string,
  maxChars: number,
): Array<{
  line: number | null;
  text: string;
}> {
  const lines = text.split(/\r?\n/);
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || line.length < 4) {
      continue;
    }

    if (
      line.startsWith("#") ||
      /设定|真相|伏笔|线索|承诺|约定|人物|状态|道具|地点|时间|fact|canon|clue|hook/i.test(
        line,
      )
    ) {
      candidates.push({
        line: index + 1,
        text: snippetAround(line, 0, 0, maxChars),
      });
    }

    if (candidates.length >= 8) {
      break;
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  return lines
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((line) => line.text.length >= 4)
    .slice(0, 5)
    .map((line) => ({
      line: line.line,
      text: snippetAround(line.text, 0, 0, maxChars),
    }));
}
