import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetAuditSources } from "./asset-sources.js";
import type { ContextSourceText } from "./context-pack.js";
import type { EnvelopeSource } from "./envelope.js";
import {
  sha256File,
  toPosix,
} from "./paths.js";
import { pathExists } from "./project-files.js";
import { isTextCandidate } from "./text-path.js";
import { truncateText } from "./context-pack.js";

export async function readContextSource(
  projectRoot: string,
  relPath: string,
  maxChars: number,
  sources: Map<string, EnvelopeSource>,
): Promise<ContextSourceText> {
  const fullPath = path.join(projectRoot, relPath);

  if (!(await pathExists(fullPath))) {
    return {
      path: relPath,
      hash: null,
      text: "",
      truncated: false,
    };
  }

  const hash = await sha256File(fullPath);
  const text = await readFile(fullPath, "utf8");
  sources.set(relPath, { path: relPath, hash });

  return {
    path: relPath,
    hash,
    ...truncateText(text, maxChars),
  };
}

export async function readNotesContext(
  projectRoot: string,
  notesRelPath: string,
  maxChars: number,
  sources: Map<string, EnvelopeSource>,
): Promise<ContextSourceText[]> {
  const notesDir = path.join(projectRoot, notesRelPath);
  const files: string[] = [];

  if (!(await pathExists(notesDir))) {
    return [];
  }

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

      const relPath = toPosix(path.relative(projectRoot, fullPath));
      if (isTextCandidate(relPath)) {
        files.push(relPath);
      }
    }
  }

  await visit(notesDir);

  const result = [];
  for (const relPath of files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).slice(0, 8)) {
    result.push(await readContextSource(projectRoot, relPath, maxChars, sources));
  }

  return result;
}

export async function readAssetAuditSources(
  projectRoot: string,
  sources: Map<string, EnvelopeSource>,
): Promise<AssetAuditSources> {
  const maxChars = Number.MAX_SAFE_INTEGER;

  return {
    world: await readContextSource(projectRoot, "bible/world.md", maxChars, sources),
    characters: await readContextSource(projectRoot, "bible/characters.md", maxChars, sources),
    timeline: await readContextSource(projectRoot, "bible/timeline.md", maxChars, sources),
    hooks: await readContextSource(projectRoot, "notes/hooks.md", maxChars, sources),
    canon: await readContextSource(projectRoot, "bible/canon.md", maxChars, sources),
    pendingCanon: await readContextSource(
      projectRoot,
      "bible/canon.pending.md",
      maxChars,
      sources,
    ),
  };
}
