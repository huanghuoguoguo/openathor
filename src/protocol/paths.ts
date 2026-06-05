import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { OpenAthorError } from "./errors.js";

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

export function isSafeRelativePath(filePath: string): boolean {
  if (path.isAbsolute(filePath)) {
    return false;
  }

  const normalized = path.normalize(filePath);
  return !normalized.split(path.sep).includes("..");
}

export function ensureSafeRelativePath(filePath: string, field: string): void {
  if (!isSafeRelativePath(filePath)) {
    throw new OpenAthorError(
      "OA_SCHEMA_INVALID",
      `${field} must be a safe relative path.`,
      { exitCode: 3 },
    );
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${digest}`;
}
