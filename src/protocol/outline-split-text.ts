import { OpenAthorError } from "./errors.js";
import type {
  OutlineSplitParts,
  OutlineSplitSegment,
} from "./model.js";
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
