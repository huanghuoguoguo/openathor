import path from "node:path";
import { OpenAthorError } from "./errors.js";
import type { EnvelopeSource, EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutline,
  OutlineSplitParts,
  OutlineSplitPlan,
  OutlineSplitSegment,
  ResolvedOutlineChapter,
} from "./model.js";
import { outlineTargetData } from "./outline-target.js";
import { toPosix } from "./paths.js";
import { snippetAround } from "./text-analysis.js";

export function normalizeSplitLine(atLine: number | undefined): number {
  if (atLine === undefined) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_LINE_REQUIRED",
      "openathor outline split requires --at-line <line>.",
      { exitCode: 2 },
    );
  }

  if (!Number.isFinite(atLine) || !Number.isInteger(atLine) || atLine < 2) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      "--at-line must be an integer line number greater than 1.",
      { exitCode: 2 },
    );
  }

  return atLine;
}

export function outlineSplitParts(
  text: string,
  splitAtLine: number,
  titleBefore: string,
  titleAfter: string,
  maxChars: number,
): OutlineSplitParts {
  const lines = splitSourceLines(text);

  if (splitAtLine > lines.length) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      `--at-line ${splitAtLine} is outside the manuscript source line range.`,
      {
        exitCode: 2,
        hints: [`The source has ${lines.length} line(s).`],
      },
    );
  }

  const beforeLines = lines.slice(0, splitAtLine - 1);
  const afterLines = lines.slice(splitAtLine - 1);

  if (!hasMeaningfulLines(beforeLines) || !hasMeaningfulLines(afterLines)) {
    throw new OpenAthorError(
      "OA_OUTLINE_SPLIT_INVALID",
      "Split must leave non-empty text before and after --at-line.",
      { exitCode: 2 },
    );
  }

  return {
    split_at_line: splitAtLine,
    line_count: lines.length,
    before: splitSegment(titleBefore, beforeLines, 1, maxChars),
    after: splitSegment(titleAfter, afterLines, splitAtLine, maxChars),
    before_text: beforeLines.join("\n"),
    after_text: afterLines.join("\n"),
  };
}

export function splitResult(
  splitPlan: OutlineSplitPlan,
  applied: boolean,
): {
  applied: boolean;
  split_at_line: number;
  before_line_range: { start: number; end: number };
  after_line_range: { start: number; end: number };
  manuscript_file_modified: boolean;
  manuscript_files_created: boolean;
  outline_modified: boolean;
  index_modified: boolean;
} {
  return {
    applied,
    split_at_line: splitPlan.split_at_line,
    before_line_range: {
      start: splitPlan.before.line_start,
      end: splitPlan.before.line_end,
    },
    after_line_range: {
      start: splitPlan.after.line_start,
      end: splitPlan.after.line_end,
    },
    manuscript_file_modified: applied,
    manuscript_files_created: applied,
    outline_modified: applied,
    index_modified: applied,
  };
}

export function splitProposalData(
  target: ResolvedOutlineChapter,
  targetHash: string,
  splitPlan: OutlineSplitPlan,
  insertedId: string,
  insertedSourcePath: string,
  dryRun: boolean,
  diff: boolean,
  previewOnly: boolean,
  plannedWrites: EnvelopeWrite[],
): {
  dry_run: boolean;
  mode: "proposal" | "diff" | "confirmed_write";
  command: "openathor outline split";
  target: ReturnType<typeof outlineTargetData>;
  split_at_line: number;
  line_count: number;
  before: OutlineSplitSegment;
  after: OutlineSplitSegment;
  inserted: {
    id: string;
    display_order: number;
    title: string;
    source_path: string;
  };
  result: ReturnType<typeof splitResult>;
  user_confirmation_required: boolean;
  confirmed_write_supported: boolean;
  planned_writes: EnvelopeWrite[];
  diff: ReturnType<typeof splitDiff>;
  next_agent_action: string;
} {
  return {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline split",
    target: outlineTargetData(target, targetHash),
    split_at_line: splitPlan.split_at_line,
    line_count: splitPlan.line_count,
    before: splitPlan.before,
    after: splitPlan.after,
    inserted: {
      id: insertedId,
      display_order: target.display_order + 1,
      title: splitPlan.after.title,
      source_path: insertedSourcePath,
    },
    result: splitResult(splitPlan, false),
    user_confirmation_required: previewOnly,
    confirmed_write_supported: true,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: splitDiff(target, splitPlan, insertedId, insertedSourcePath),
    next_agent_action: previewOnly
      ? "Show the split proposal to the user and rerun with --confirm --base-hash only after explicit approval."
      : "Run openathor outline show --json and refresh context before follow-up writing.",
  };
}

export function splitWrites(
  target: ResolvedOutlineChapter,
  insertedSourcePath: string,
  runRelPath: string,
  shiftsIndexedChapters: boolean,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: target.source_path ?? "",
      change_type: "modified",
      reason: "outline_split_source_before_segment",
    },
    {
      path: insertedSourcePath,
      change_type: "created",
      reason: "outline_split_source_after_segment",
    },
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_split_metadata",
    },
  ];

  if (target.indexedChapter || shiftsIndexedChapters) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_split_index",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_split_run_record",
  });

  return writes;
}

export function splitSourcePath(
  sourcePath: string,
  insertedOrder: number,
  insertedId: string,
): string {
  const dir = path.posix.dirname(toPosix(sourcePath));
  const ext = path.posix.extname(sourcePath) || ".md";
  const base = path.posix.basename(sourcePath, ext);
  return path.posix.join(
    dir,
    `${base}-split-${String(insertedOrder).padStart(3, "0")}-${insertedId}${ext}`,
  );
}

export function splitDisplayOrderById(
  chapters: ChapterOutline,
  insertedOrder: number,
  targetId: string,
): Map<string, number> {
  return new Map(
    chapters.chapters
      .filter((chapter) => chapter.id !== targetId && chapter.display_order >= insertedOrder)
      .map((chapter) => [chapter.id, chapter.display_order + 1]),
  );
}

export function splitSources(
  sources: EnvelopeSource[],
  sourcePath: string,
  sourceHash: string,
): EnvelopeSource[] {
  const relevant = new Set([
    "outline/chapters.yaml",
    ".openathor/manuscript.index.yaml",
    sourcePath,
  ]);
  const sourceMap = new Map(
    sources
      .filter((source) => relevant.has(source.path))
      .map((source) => [source.path, source]),
  );

  sourceMap.set(sourcePath, { path: sourcePath, hash: sourceHash });

  return [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function splitDiff(
  target: ResolvedOutlineChapter,
  splitPlan: OutlineSplitPlan,
  insertedId?: string,
  insertedSourcePath?: string,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Proposal only: identify a chapter split boundary and future metadata/text edits; no files are changed.",
    changes: [
      {
        path: target.source_path ?? "",
        field: "split_at_line",
        from: null,
        to: splitPlan.split_at_line,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${target.id}].title`,
        from: target.title,
        to: splitPlan.before.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${target.id}].title`,
        from: null,
        to: splitPlan.after.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${target.id}].id`,
        from: null,
        to: insertedId ?? null,
      },
      {
        path: insertedSourcePath ?? "",
        field: "created_source",
        from: null,
        to: splitPlan.after.title,
      },
      {
        path: ".openathor/manuscript.index.yaml",
        field: `chapters[${target.id}].source_split`,
        from: null,
        to: splitPlan.after.line_start,
      },
    ],
  };
}

function splitSourceLines(text: string): string[] {
  const withoutFinalNewline = text.replace(/\r?\n$/, "");
  return withoutFinalNewline.length > 0 ? withoutFinalNewline.split(/\r?\n/) : [""];
}

function hasMeaningfulLines(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0);
}

function splitSegment(
  title: string,
  lines: string[],
  lineStart: number,
  maxChars: number,
): OutlineSplitSegment {
  const rawText = lines.join("\n");
  const compactText = rawText.replace(/\s+/g, " ").trim();
  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0)?.trim() ?? "";

  return {
    title,
    line_start: lineStart,
    line_end: lineStart + lines.length - 1,
    char_count: rawText.trim().length,
    preview: snippetAround(compactText, 0, 0, maxChars),
    starts_with_heading: firstMeaningfulLine.startsWith("#"),
  };
}
