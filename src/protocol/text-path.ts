import path from "node:path";

export const SKIPPED_TEXT_SCAN_DIRS = new Set([
  ".git",
  ".openathor",
  "node_modules",
  "dist",
  "coverage",
  "exports",
]);

export function isTextCandidate(relPath: string): boolean {
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".txt";
}
