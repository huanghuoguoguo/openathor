import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import {
  contextData,
  contextWindow,
  normalizeContextMaxChars,
} from "./context-pack.js";
import {
  readContextSource,
  readNotesContext,
} from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import { findProjectRoot } from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import type {
  CommandResult,
  ContextOptions,
} from "./model.js";

export async function runContext(options: ContextOptions = {}): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const scope = options.scope ?? "project";
  const maxChars = normalizeContextMaxChars(options.maxChars);
  const baseSources = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    baseSources.set(source.path, source);
  }

  const confirmedCanon = await readContextSource(
    projectRoot,
    "bible/canon.md",
    maxChars.section,
    baseSources,
  );
  const pendingCanon = await readContextSource(
    projectRoot,
    "bible/canon.pending.md",
    maxChars.section,
    baseSources,
  );
  const style = await readContextSource(
    projectRoot,
    "bible/style.md",
    maxChars.section,
    baseSources,
  );
  const world = await readContextSource(
    projectRoot,
    "bible/world.md",
    maxChars.section,
    baseSources,
  );
  const characters = await readContextSource(
    projectRoot,
    "bible/characters.md",
    maxChars.section,
    baseSources,
  );
  const timeline = await readContextSource(
    projectRoot,
    "bible/timeline.md",
    maxChars.section,
    baseSources,
  );
  const styleProfiles = await readContextSource(
    projectRoot,
    "style/profiles.yaml",
    maxChars.section,
    baseSources,
  );
  const styleReferences = await readContextSource(
    projectRoot,
    "style/references.yaml",
    maxChars.section,
    baseSources,
  );
  const notes = await readNotesContext(
    projectRoot,
    inspection.config.paths.notes,
    maxChars.note,
    baseSources,
  );
  const targetChapter =
    scope === "chapter"
      ? resolveContextChapter(
          options.target,
          inspection.chapters,
          inspection.manuscriptIndex,
        )
      : null;
  const nearbyChapters =
    scope === "chapter" && targetChapter
      ? contextWindow(inspection.manuscriptIndex.chapters, targetChapter.display_order)
      : [];
  const manuscript = [];

  for (const chapter of nearbyChapters) {
    manuscript.push({
      ...chapter,
      content: await readContextSource(
        projectRoot,
        chapter.source_path,
        chapter.id === targetChapter?.id
          ? maxChars.targetChapter
          : maxChars.neighborChapter,
        baseSources,
      ),
    });
  }

  const warnings = [...inspection.warnings];

  if (scope === "project" && inspection.manuscriptIndex.chapters.length === 0) {
    warnings.push({
      code: "OA_CONTEXT_EMPTY_PROJECT",
      message: "The project has no indexed chapters yet.",
      severity: "low",
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...baseSources.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings,
    data: contextData({
      generatedAt: new Date().toISOString(),
      scope,
      targetInput: options.target,
      targetChapter,
      maxChars,
      config: inspection.config,
      chapters: inspection.chapters,
      manuscriptIndex: inspection.manuscriptIndex,
      confirmedCanon,
      pendingCanon,
      style,
      styleProfiles,
      styleReferences,
      world,
      characters,
      timeline,
      notes,
      manuscriptContext: manuscript,
    }),
  };
}
