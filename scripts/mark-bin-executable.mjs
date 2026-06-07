#!/usr/bin/env node
import { chmod, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

for (const relPath of Object.values(packageJson.bin ?? {})) {
  if (typeof relPath !== "string") {
    continue;
  }

  const fullPath = path.resolve(projectRoot, relPath);
  await stat(fullPath);
  await chmod(fullPath, 0o755);
}
