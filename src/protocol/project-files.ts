import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import {
  isSafeRelativePath,
  sha256File,
  toPosix,
} from "./paths.js";

export async function findProjectRoot(start: string): Promise<string> {
  let current = start;

  while (true) {
    if (await pathExists(path.join(current, "openathor.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new OpenAthorError(
        "OA_PROJECT_NOT_FOUND",
        "No openathor.yaml found in the current directory or its parents.",
        { exitCode: 2 },
      );
    }

    current = parent;
  }
}

export async function hashSources(root: string, relPaths: string[]): Promise<EnvelopeSource[]> {
  const unique = [...new Set(relPaths.map((relPath) => toPosix(relPath)))];
  const sources: EnvelopeSource[] = [];

  for (const relPath of unique) {
    if (!isSafeRelativePath(relPath)) {
      continue;
    }

    const fullPath = path.join(root, relPath);
    if (await pathExists(fullPath)) {
      sources.push({
        path: relPath,
        hash: await sha256File(fullPath),
      });
    }
  }

  return sources;
}

export async function readSourceText(
  root: string,
  relPath: string,
  sources?: Map<string, EnvelopeSource>,
): Promise<{
  path: string;
  hash: string;
  text: string;
}> {
  const fullPath = path.join(root, relPath);
  const hash = await sha256File(fullPath);
  const text = await readFile(fullPath, "utf8");
  sources?.set(relPath, { path: relPath, hash });

  return {
    path: relPath,
    hash,
    text,
  };
}

export function addKnownSource(
  sourceMap: Map<string, EnvelopeSource>,
  sources: EnvelopeSource[],
  relPath: string,
): void {
  const source = sources.find((candidate) => candidate.path === relPath);

  if (source) {
    sourceMap.set(relPath, source);
  }
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

export async function hasEntries(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function writeYaml(root: string, relPath: string, data: unknown): Promise<void> {
  await writeText(root, relPath, stringifyYaml(data));
}

export async function writeText(root: string, relPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
  await writeFile(path.join(root, relPath), text, "utf8");
}

export async function appendText(root: string, relPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
  const filePath = path.join(root, relPath);
  const existing = (await pathExists(filePath)) ? await readFile(filePath, "utf8") : "";
  await writeFile(filePath, `${existing}${existing.endsWith("\n") ? "" : "\n"}${text}`, "utf8");
}
