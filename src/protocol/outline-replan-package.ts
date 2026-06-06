import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { OpenAthorError } from "./errors.js";
import type {
  OutlineReplanChapterInput,
  OutlineReplanPackage,
} from "./model.js";
import {
  ensureSafeRelativePath,
  toPosix,
} from "./paths.js";
import {
  isPlainRecord,
  optionalString,
  stringArray,
} from "./value.js";

export async function readOutlineReplanPackage(
  projectRoot: string,
  safeRelPath: string,
  pathExists: (filePath: string) => Promise<boolean>,
): Promise<OutlineReplanPackage> {
  const fullPath = path.join(projectRoot, safeRelPath);

  if (!(await pathExists(fullPath))) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_NOT_FOUND",
      `Outline replan package not found: ${safeRelPath}`,
      { exitCode: 2 },
    );
  }

  const text = await readFile(fullPath, "utf8");
  let parsed: unknown;

  try {
    parsed =
      safeRelPath.endsWith(".json") || safeRelPath.endsWith(".jsonc")
        ? JSON.parse(text)
        : parseYaml(text);
  } catch (error) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      `Cannot parse outline replan package ${safeRelPath}: ${String(error)}`,
      { exitCode: 3 },
    );
  }

  return normalizeOutlineReplanPackage(parsed);
}

export function normalizeOutlineReplanPackagePath(relPath: string): string {
  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "--from-package");

  return safeRelPath;
}

function normalizeOutlineReplanPackage(value: unknown): OutlineReplanPackage {
  if (!isPlainRecord(value)) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      "Outline replan package must be a JSON/YAML object.",
      { exitCode: 3 },
    );
  }

  const chaptersValue = value.chapters;
  if (!Array.isArray(chaptersValue) || chaptersValue.length === 0) {
    throw new OpenAthorError(
      "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
      "Outline replan package requires non-empty chapters[].",
      { exitCode: 3 },
    );
  }

  return {
    chapters: chaptersValue.map((item, index) =>
      normalizeOutlineReplanChapterInput(item, index),
    ),
  };
}

function normalizeOutlineReplanChapterInput(
  value: unknown,
  index: number,
): OutlineReplanChapterInput {
  if (!isPlainRecord(value)) {
    throw invalidOutlineReplanItem(index, "must be an object");
  }

  const id = optionalString(value.id);
  if (id && !/^ch_[a-z0-9_]+$/.test(id)) {
    throw invalidOutlineReplanItem(index, `id ${id} is not a valid chapter id`);
  }

  const title = optionalString(value.title);
  if (!title) {
    throw invalidOutlineReplanItem(index, "requires title");
  }

  const status = optionalString(value.status) ?? "planned";
  if (status !== "planned") {
    throw invalidOutlineReplanItem(index, "confirmed replan package chapters must be planned");
  }

  const links = isPlainRecord(value.links) ? value.links : null;

  return {
    id,
    title,
    status,
    summary: optionalString(value.summary),
    scenes: stringArray(value.scenes),
    links,
  };
}

function invalidOutlineReplanItem(index: number, reason: string): OpenAthorError {
  return new OpenAthorError(
    "OA_OUTLINE_REPLAN_PACKAGE_INVALID",
    `Invalid outline replan package item chapters.${index}: ${reason}.`,
    { exitCode: 3 },
  );
}
