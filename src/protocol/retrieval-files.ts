import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ManuscriptIndex,
  ProjectConfig,
  VectorIndex,
  VectorIndexDocument,
} from "./model.js";
import { isSafeRelativePath, sha256File, toPosix } from "./paths.js";
import { titleFromText } from "./title.js";
import {
  VECTOR_DIMENSIONS,
  cosineSimilarity,
  deterministicEmbedding,
  extractSearchTerms,
  snippetAround,
} from "./text-analysis.js";
import { isTextCandidate, SKIPPED_TEXT_SCAN_DIRS } from "./text-path.js";

export type RetrievalProjectState = {
  config: ProjectConfig;
  manuscriptIndex: ManuscriptIndex;
};

export async function searchCandidatePaths(
  projectRoot: string,
  state: RetrievalProjectState,
): Promise<string[]> {
  const candidates = new Set<string>();

  for (const chapter of state.manuscriptIndex.chapters) {
    candidates.add(chapter.source_path);
  }

  for (const relPath of [
    "bible/canon.md",
    "bible/canon.pending.md",
    "bible/style.md",
    "outline/chapters.yaml",
    "outline/scenes.yaml",
    "outline/volumes.yaml",
  ]) {
    candidates.add(relPath);
  }

  for (const dir of [state.config.paths.notes, state.config.paths.reviews]) {
    for (const relPath of await listTextFiles(projectRoot, dir)) {
      candidates.add(relPath);
    }
  }

  for (const relPath of await listProjectTextFiles(projectRoot)) {
    candidates.add(relPath);
  }

  const existing = [];
  for (const relPath of candidates) {
    if (isSafeRelativePath(relPath) && (await pathExists(path.join(projectRoot, relPath)))) {
      existing.push(relPath);
    }
  }

  return existing.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export async function buildVectorIndex(
  projectRoot: string,
  state: RetrievalProjectState,
): Promise<VectorIndex> {
  const documents: VectorIndexDocument[] = [];
  const relPaths = await searchCandidatePaths(projectRoot, state);
  const indexedBySource = new Map(
    state.manuscriptIndex.chapters.map((chapter) => [chapter.source_path, chapter]),
  );

  for (const relPath of relPaths) {
    const fullPath = path.join(projectRoot, relPath);
    const text = await readFile(fullPath, "utf8");
    const terms = extractSearchTerms(text);

    if (terms.length === 0) {
      continue;
    }

    const indexedChapter = indexedBySource.get(relPath);
    documents.push({
      path: relPath,
      hash: await sha256File(fullPath),
      kind: indexedChapter ? "chapter" : vectorDocumentKind(relPath),
      title: indexedChapter?.title ?? titleFromText(text),
      terms: terms.slice(0, 40),
      vector: deterministicEmbedding(terms),
      preview: snippetAround(text.replace(/\s+/g, " ").trim(), 0, 0, 360),
    });
  }

  return {
    schema_version: "openathor.vector_index.v1",
    generated_at: new Date().toISOString(),
    method: "deterministic_hash_embedding_v1",
    dimensions: VECTOR_DIMENSIONS,
    documents,
  };
}

export function semanticVectorMatches(
  vectorIndex: VectorIndex,
  query: string,
  maxChars: number,
  limit: number,
): {
  queryTerms: string[];
  matches: Array<{
    path: string;
    hash: string;
    kind: string;
    title: string | null;
    score: number;
    shared_terms: string[];
    snippet: string;
  }>;
} {
  const queryTerms = extractSearchTerms(query);
  const queryVector = deterministicEmbedding(queryTerms.length > 0 ? queryTerms : [query]);
  const matches = vectorIndex.documents
    .map((document) => ({
      path: document.path,
      hash: document.hash,
      kind: document.kind,
      title: document.title,
      score: cosineSimilarity(queryVector, document.vector),
      shared_terms: document.terms.filter((term) => queryTerms.includes(term)).slice(0, 12),
      snippet: snippetAround(document.preview, 0, 0, maxChars),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-Hans-CN"))
    .slice(0, limit);

  return { queryTerms, matches };
}

function vectorDocumentKind(relPath: string): string {
  if (relPath.startsWith("bible/")) {
    return "bible";
  }
  if (relPath.startsWith("outline/")) {
    return "outline";
  }
  if (relPath.startsWith("notes/")) {
    return "note";
  }
  if (relPath.startsWith("style/")) {
    return "style";
  }
  if (relPath.startsWith("reviews/")) {
    return "review";
  }
  return "text";
}

async function listProjectTextFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIPPED_TEXT_SCAN_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isSearchableTextPath(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(projectRoot);
  return files;
}

async function listTextFiles(projectRoot: string, relDir: string): Promise<string[]> {
  const root = path.join(projectRoot, relDir);
  const files: string[] = [];

  if (!(await pathExists(root))) {
    return files;
  }

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isSearchableTextPath(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(root);
  return files;
}

function isSearchableTextPath(relPath: string): boolean {
  return (
    isTextCandidate(relPath) ||
    relPath.endsWith(".yaml") ||
    relPath.endsWith(".yml") ||
    relPath.endsWith(".json")
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
