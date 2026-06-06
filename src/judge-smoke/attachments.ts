import { readFile } from "node:fs/promises";
import path from "node:path";
import { OpenAthorError } from "../protocol/errors.js";
import { scoreDimensions } from "./scenarios.js";
import type {
  JudgeDimension,
  JudgeScoresAttachment,
} from "./types.js";

export async function readAttachment(
  cwd: string,
  relOrAbsPath: string,
): Promise<{ path: string; text: string }> {
  const absolutePath = path.resolve(cwd, relOrAbsPath);
  const text = await readFile(absolutePath, "utf8");

  if (!text.trim()) {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      `Evidence attachment is empty: ${relOrAbsPath}`,
      { exitCode: 4 },
    );
  }

  return {
    path: relOrAbsPath,
    text,
  };
}

export async function readJudgeScoresAttachment(
  cwd: string,
  relOrAbsPath: string,
): Promise<JudgeScoresAttachment> {
  const absolutePath = path.resolve(cwd, relOrAbsPath);
  const text = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(text) as Partial<JudgeScoresAttachment>;

  if (
    parsed.verdict !== "pass" &&
    parsed.verdict !== "fail" &&
    parsed.verdict !== "needs_review"
  ) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include verdict: pass, fail, or needs_review.",
      { exitCode: 4 },
    );
  }

  if (!Array.isArray(parsed.blocking_failures)) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include blocking_failures as an array.",
      { exitCode: 4 },
    );
  }

  const scores = parsed.scores as Record<string, unknown> | undefined;
  if (!scores) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include all rubric score dimensions.",
      { exitCode: 4 },
    );
  }

  for (const dimension of scoreDimensions) {
    const score = scores[dimension];
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5
    ) {
      throw new OpenAthorError(
        "OA_JUDGE_SCORES_INVALID",
        `Judge score ${dimension} must be an integer from 1 to 5.`,
        { exitCode: 4 },
      );
    }
  }

  return {
    verdict: parsed.verdict,
    blocking_failures: parsed.blocking_failures,
    scores: Object.fromEntries(
      scoreDimensions.map((dimension) => [dimension, scores[dimension] as number]),
    ) as Record<JudgeDimension, number>,
    judge_model: parsed.judge_model,
    notes: parsed.notes,
  };
}
