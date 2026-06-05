import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { sha256File } from "./paths.js";
import {
  findProjectRoot,
  pathExists,
} from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import {
  searchCandidatePaths,
  semanticVectorMatches,
} from "./retrieval-files.js";
import {
  extractSearchTerms,
  findTextMatches,
  normalizeLimit,
  normalizeSnippetChars,
  relatedScore,
} from "./text-analysis.js";
import type {
  CommandResult,
  SearchRelatedOptions,
  SearchSemanticOptions,
  SearchTextOptions,
  VectorIndex,
} from "./model.js";

export async function runSearchText(
  options: SearchTextOptions = {},
): Promise<CommandResult> {
  const query = options.query?.trim();
  if (!query) {
    throw new OpenAthorError(
      "OA_SEARCH_QUERY_REQUIRED",
      "openathor search text requires a query.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const limit = normalizeLimit(options.limit, 20);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const matches = [];
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const relPath of relPaths) {
    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const hash = await sha256File(fullPath);
    const fileMatches = findTextMatches(text, query, maxChars).map((match) => ({
      path: relPath,
      hash,
      ...match,
    }));

    if (fileMatches.length > 0) {
      sourceMap.set(relPath, { path: relPath, hash });
      matches.push(...fileMatches);
    }

    if (matches.length >= limit) {
      break;
    }
  }

  const limitedMatches = matches.slice(0, limit);

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      query,
      limit,
      match_count: limitedMatches.length,
      truncated: matches.length > limit,
      matches: limitedMatches,
    },
  };
}

export async function runSearchRelated(
  options: SearchRelatedOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_SEARCH_UNSUPPORTED_SCOPE",
      "openathor search related currently supports only chapter scope.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const targetChapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const targetText = await readFile(path.join(projectRoot, targetChapter.source_path), "utf8");
  const targetTerms = extractSearchTerms(targetText);

  if (targetTerms.length === 0) {
    throw new OpenAthorError(
      "OA_SEARCH_RELATED_NO_TERMS",
      `Cannot extract searchable terms from ${targetChapter.id}.`,
      { exitCode: 2 },
    );
  }

  const limit = normalizeLimit(options.limit, 10);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const relPaths = await searchCandidatePaths(projectRoot, inspection);
  const sourceMap = new Map<string, EnvelopeSource>();
  const results = [];

  for (const relPath of relPaths) {
    if (relPath === targetChapter.source_path) {
      continue;
    }

    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const related = relatedScore(text, targetTerms, maxChars);

    if (related.score <= 0) {
      continue;
    }

    const hash = await sha256File(fullPath);
    sourceMap.set(relPath, { path: relPath, hash });
    results.push({
      path: relPath,
      hash,
      score: related.score,
      shared_terms: related.sharedTerms,
      snippet: related.snippet,
    });
  }

  const matches = results
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, limit);

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: inspection.warnings,
    data: {
      scope: "chapter",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: targetChapter.source_path,
      },
      method: "deterministic_term_overlap",
      limit,
      match_count: matches.length,
      target_terms: targetTerms.slice(0, 20),
      matches,
    },
  };
}

export async function runSearchSemantic(
  options: SearchSemanticOptions = {},
): Promise<CommandResult> {
  const query = options.query?.trim();
  if (!query) {
    throw new OpenAthorError(
      "OA_SEARCH_QUERY_REQUIRED",
      "openathor search semantic requires a query.",
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const vectorRel = path.posix.join(inspection.config.paths.vector_index, "index.json");
  const vectorPath = path.join(projectRoot, vectorRel);

  if (!(await pathExists(vectorPath))) {
    throw new OpenAthorError(
      "OA_VECTOR_INDEX_NOT_FOUND",
      "Semantic search requires a vector index.",
      {
        exitCode: 3,
        hints: ["Run openathor index rebuild --vector --json first."],
      },
    );
  }

  const vectorIndex = JSON.parse(await readFile(vectorPath, "utf8")) as VectorIndex;
  if (vectorIndex.schema_version !== "openathor.vector_index.v1") {
    throw new OpenAthorError(
      "OA_VECTOR_INDEX_INVALID",
      "Unsupported vector index schema_version.",
      { exitCode: 3 },
    );
  }

  const limit = normalizeLimit(options.limit, 10);
  const maxChars = normalizeSnippetChars(options.maxChars);
  const { queryTerms, matches } = semanticVectorMatches(
    vectorIndex,
    query,
    maxChars,
    limit,
  );

  const sources = [
    { path: vectorRel, hash: await sha256File(vectorPath) },
    ...matches.map((match) => ({ path: match.path, hash: match.hash })),
  ];

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources,
    writes: [],
    warnings: inspection.warnings,
    data: {
      query,
      method: vectorIndex.method,
      vector_index: vectorRel,
      limit,
      match_count: matches.length,
      query_terms: queryTerms.slice(0, 20),
      matches,
    },
  };
}
