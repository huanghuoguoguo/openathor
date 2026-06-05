import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { EnvelopeSource } from "./envelope.js";
import { isSafeRelativePath, sha256File, toPosix } from "./paths.js";
import {
  asRecordArray,
  readYamlObjectFile,
} from "./yaml-records.js";

export type StyleReferenceCopyMatch = {
  reference_path: string;
  excerpt: string;
};

export async function detectStyleReferenceCopy(
  projectRoot: string,
  revisedText: string,
  sourceMap: Map<string, EnvelopeSource>,
): Promise<StyleReferenceCopyMatch | null> {
  const referencesRelPath = "style/references.yaml";
  const referencesPath = path.join(projectRoot, referencesRelPath);

  if (!(await pathExists(referencesPath))) {
    return null;
  }

  const referencesHash = await sha256File(referencesPath);
  sourceMap.set(referencesRelPath, { path: referencesRelPath, hash: referencesHash });
  const referencesData = await readYamlObjectFile(referencesPath, { references: [] });
  const normalizedRevision = normalizeCopyCheckText(revisedText);

  for (const reference of asRecordArray(referencesData.references)) {
    if (
      reference.allowed_use !== "style_analysis" ||
      typeof reference.path !== "string" ||
      !isSafeRelativePath(reference.path)
    ) {
      continue;
    }

    const referencePath = toPosix(reference.path);
    const fullReferencePath = path.join(projectRoot, referencePath);
    if (!(await pathExists(fullReferencePath)) || !isTextCandidate(referencePath)) {
      continue;
    }

    const referenceHash = await sha256File(fullReferencePath);
    sourceMap.set(referencePath, { path: referencePath, hash: referenceHash });
    const referenceText = await readFile(fullReferencePath, "utf8");
    const copiedExcerpt = copiedStyleReferenceExcerpt(referenceText, normalizedRevision);
    if (copiedExcerpt) {
      return { reference_path: referencePath, excerpt: copiedExcerpt };
    }
  }

  return null;
}

function copiedStyleReferenceExcerpt(
  referenceText: string,
  normalizedRevision: string,
): string | null {
  for (const excerpt of styleReferenceCopyCandidates(referenceText)) {
    if (normalizedRevision.includes(normalizeCopyCheckText(excerpt))) {
      return excerpt;
    }
  }

  return null;
}

function styleReferenceCopyCandidates(referenceText: string): string[] {
  const candidates = new Set<string>();

  for (const rawLine of referenceText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 14 || /^#{1,6}\s+/u.test(line)) {
      continue;
    }
    candidates.add(line);
  }

  const compact = referenceText
    .replace(/^#{1,6}\s+.*$/gmu, "")
    .replace(/\s+/g, "");
  const chars = [...compact];
  const windowSize = 28;

  if (chars.length >= windowSize) {
    for (let index = 0; index <= chars.length - windowSize; index += windowSize) {
      candidates.add(chars.slice(index, index + windowSize).join(""));
    }
  }

  return [...candidates].filter((candidate) => normalizeCopyCheckText(candidate).length >= 14);
}

function normalizeCopyCheckText(text: string): string {
  return text
    .replace(/^#{1,6}\s+.*$/gmu, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isTextCandidate(relPath: string): boolean {
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".txt";
}
