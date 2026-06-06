import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { sha256File, toPosix } from "../protocol/paths.js";
import type { FixtureFileChange } from "./types.js";

export async function removeGitkeepFiles(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await removeGitkeepFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name === ".gitkeep") {
      await rm(fullPath, { force: true });
    }
  }
}

export async function hashExistingFiles(root: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();

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

      const relPath = toPosix(path.relative(root, fullPath));
      hashes.set(relPath, await sha256File(fullPath));
    }
  }

  await visit(root);
  return hashes;
}

export async function collectFileChanges(
  root: string,
  beforeHashes: Map<string, string>,
  beforeExcerpts: Map<string, string>,
): Promise<FixtureFileChange[]> {
  const afterHashes = await hashExistingFiles(root);
  const allPaths = new Set([...beforeHashes.keys(), ...afterHashes.keys()]);
  const changes: FixtureFileChange[] = [];

  for (const relPath of [...allPaths].sort()) {
    const beforeHash = beforeHashes.get(relPath) ?? null;
    const afterHash = afterHashes.get(relPath) ?? null;

    if (beforeHash === afterHash) {
      continue;
    }

    const changeType =
      beforeHash === null ? "created" : afterHash === null ? "deleted" : "modified";
    const beforeExcerpt = beforeExcerpts.get(relPath);
    const afterExcerpt =
      afterHash === null ? undefined : await readTextExcerpt(path.join(root, relPath));

    changes.push({
      path: relPath,
      change_type: changeType,
      before_hash: beforeHash,
      after_hash: afterHash,
      ...(beforeExcerpt ? { before_excerpt: beforeExcerpt } : {}),
      ...(afterExcerpt ? { after_excerpt: afterExcerpt } : {}),
    });
  }

  return changes;
}

export async function textExcerptsForHashes(
  root: string,
  hashes: Map<string, string>,
): Promise<Map<string, string>> {
  const excerpts = new Map<string, string>();

  for (const relPath of hashes.keys()) {
    const excerpt = await readTextExcerpt(path.join(root, relPath));
    if (excerpt) {
      excerpts.set(relPath, excerpt);
    }
  }

  return excerpts;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function readTextExcerpt(filePath: string): Promise<string | undefined> {
  if (filePath.endsWith(".sqlite")) {
    return undefined;
  }

  try {
    const buffer = await readFile(filePath);
    const text = buffer.toString("utf8");

    if (text.includes("\u0000")) {
      return undefined;
    }

    return text.slice(0, 1200);
  } catch {
    return undefined;
  }
}
