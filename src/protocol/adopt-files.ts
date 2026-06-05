import { readdir } from "node:fs/promises";
import path from "node:path";
import type {
  ClassifiedFile,
  IndexedChapter,
  ManuscriptIndex,
} from "./model.js";
import { sha256File, toPosix } from "./paths.js";
import { isTextCandidate, SKIPPED_TEXT_SCAN_DIRS } from "./text-path.js";
import { shortHash, slugAscii } from "./identifiers.js";

export async function scanUserFiles(root: string): Promise<string[]> {
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

      const relPath = toPosix(path.relative(root, fullPath));
      if (isTextCandidate(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(root);
  return files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function classifyFile(relPath: string): ClassifiedFile {
  const normalized = relPath.toLowerCase();
  const basename = path.posix.basename(relPath, path.posix.extname(relPath));
  const parsed = parseChapterOrder(basename);
  const inManuscriptDir =
    normalized.includes("正文/") ||
    normalized.includes("manuscript/") ||
    normalized.includes("chapter") ||
    normalized.includes("chapters/");

  if (parsed.order !== null || inManuscriptDir) {
    return {
      path: relPath,
      kind: "chapter",
      title: parsed.title || basename,
      order: parsed.order,
      reason: parsed.order === null ? "chapter path without stable numeric order" : "chapter",
    };
  }

  if (
    normalized.includes("设定") ||
    normalized.includes("人物") ||
    normalized.includes("世界观") ||
    normalized.includes("bible") ||
    normalized.includes("setting") ||
    normalized.includes("notes/")
  ) {
    return {
      path: relPath,
      kind: "note",
      title: basename,
      order: null,
      reason: "project note or setting",
    };
  }

  if (normalized.includes("风格") || normalized.includes("style")) {
    return {
      path: relPath,
      kind: "style_reference",
      title: basename,
      order: null,
      reason: "style reference candidate",
    };
  }

  if (
    normalized.includes("废稿") ||
    normalized.includes("scrap") ||
    normalized.includes("trash") ||
    normalized.includes("discard")
  ) {
    return {
      path: relPath,
      kind: "scrap",
      title: basename,
      order: null,
      reason: "scrap draft must not become confirmed canon",
    };
  }

  return {
    path: relPath,
    kind: "unclassified",
    title: basename,
    order: null,
    reason: "unclassified text file",
  };
}

export function duplicateNumericOrders(chapters: ClassifiedFile[]): Set<number> {
  const seen = new Set<number>();
  const duplicated = new Set<number>();

  for (const chapter of chapters) {
    if (chapter.order === null) {
      continue;
    }

    if (seen.has(chapter.order)) {
      duplicated.add(chapter.order);
    }

    seen.add(chapter.order);
  }

  return duplicated;
}

export function buildAdoptQuestions(
  chapters: ClassifiedFile[],
  duplicateOrders: Set<number>,
  scraps: ClassifiedFile[],
  unclassified: ClassifiedFile[],
): ManuscriptIndex["questions"] {
  const questions: NonNullable<ManuscriptIndex["questions"]> = [];

  for (const chapter of chapters) {
    if (chapter.order === null) {
      questions.push({
        id: `confirm_order_${shortHash(chapter.path)}`,
        path: chapter.path,
        question: "Confirm this chapter's display order.",
        reason: "No stable chapter number was detected.",
      });
    } else if (duplicateOrders.has(chapter.order)) {
      questions.push({
        id: `dedupe_order_${shortHash(chapter.path)}`,
        path: chapter.path,
        question: `Resolve duplicate chapter order ${chapter.order}.`,
        reason: "Two or more files share the same detected chapter number.",
      });
    }
  }

  for (const file of [...scraps, ...unclassified]) {
    questions.push({
      id: `classify_${shortHash(file.path)}`,
      path: file.path,
      question: "Confirm whether this file should be imported, ignored, or archived.",
      reason: file.reason,
    });
  }

  return questions;
}

export async function buildIndexedChapters(
  root: string,
  chapters: ClassifiedFile[],
  duplicateOrders: Set<number>,
): Promise<IndexedChapter[]> {
  const sorted = [...chapters].sort((a, b) => {
    if (a.order !== null && b.order !== null && a.order !== b.order) {
      return a.order - b.order;
    }

    if (a.order !== null && b.order === null) {
      return -1;
    }

    if (a.order === null && b.order !== null) {
      return 1;
    }

    return a.path.localeCompare(b.path, "zh-Hans-CN");
  });

  const usedIds = new Set<string>();
  const result: IndexedChapter[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const chapter = sorted[index];
    const displayOrder = index + 1;
    const id = uniqueChapterId(chapter, displayOrder, usedIds);
    const confidence =
      chapter.order === null || duplicateOrders.has(chapter.order) ? "low" : "high";

    usedIds.add(id);
    result.push({
      id,
      display_order: displayOrder,
      title: chapter.title,
      source_path: chapter.path,
      status: "existing",
      origin: "adopted",
      content_hash: await sha256File(path.join(root, chapter.path)),
      detected_title: chapter.title,
      confidence,
    });
  }

  return result;
}

function parseChapterOrder(basename: string): { order: number | null; title: string } {
  const arabic = basename.match(/^(?:ch(?:apter)?[-_ ]*)?0*(\d{1,4})(?:[-_. ]+)?(.*)$/i);
  if (arabic) {
    return {
      order: Number(arabic[1]),
      title: stripTitle(arabic[2] || basename),
    };
  }

  const chinese = basename.match(/^第\s*([一二三四五六七八九十百千万两0-9]+)\s*[章节回]\s*(.*)$/);
  if (chinese) {
    return {
      order: parseChineseNumber(chinese[1]),
      title: stripTitle(chinese[2] || basename),
    };
  }

  return { order: null, title: stripTitle(basename) };
}

function uniqueChapterId(
  chapter: ClassifiedFile,
  displayOrder: number,
  usedIds: Set<string>,
): string {
  const orderPart = String(chapter.order ?? displayOrder).padStart(3, "0");
  const titlePart = slugAscii(chapter.title) || shortHash(chapter.path);
  let candidate = `ch_${orderPart}_${titlePart}`;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `ch_${orderPart}_${titlePart}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function stripTitle(value: string): string {
  return value.replace(/^[-_.\s]+/, "").trim();
}

function parseChineseNumber(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const digitByChar: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (value === "十") {
    return 10;
  }

  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex);
    const right = value.slice(tenIndex + 1);
    const tens = left ? digitByChar[left] ?? 1 : 1;
    const ones = right ? digitByChar[right] ?? 0 : 0;
    return tens * 10 + ones;
  }

  return digitByChar[value] ?? 0;
}
