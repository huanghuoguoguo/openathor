import path from "node:path";
import type { EnvelopeWrite } from "./envelope.js";
import {
  buildVectorIndex,
} from "./retrieval-files.js";
import {
  inspectionWithManuscriptIndex,
  inspectProject,
} from "./project-inspection.js";
import { rebuildManuscriptIndexFromOutline } from "./manuscript-index-rebuild.js";
import { writeSqliteIndex } from "./sqlite-index.js";
import {
  findProjectRoot,
  pathExists,
  writeText,
  writeYaml,
} from "./project-files.js";
import { sha256File } from "./paths.js";
import type {
  CommandResult,
  IndexRebuildOptions,
} from "./model.js";

export async function runIndexRebuild(
  options: IndexRebuildOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const dryRun = options.dryRun ?? false;
  const initialInspection = await inspectProject(projectRoot, { includeIndexWarning: false });
  const rebuiltManuscriptIndex = await rebuildManuscriptIndexFromOutline(
    projectRoot,
    initialInspection.chapters,
    initialInspection.manuscriptIndex,
  );
  const manuscriptIndexRel = initialInspection.config.paths.manuscript_index;
  const sqliteRel = initialInspection.config.paths.sqlite_index;
  const sqlitePath = path.join(projectRoot, sqliteRel);
  const vectorRel = path.posix.join(initialInspection.config.paths.vector_index, "index.json");
  const vectorPath = path.join(projectRoot, vectorRel);
  const manuscriptIndexPath = path.join(projectRoot, manuscriptIndexRel);
  const plannedWrites: EnvelopeWrite[] = [
    plannedWrite(
      manuscriptIndexRel,
      await pathExists(manuscriptIndexPath),
      "manuscript_index_rebuild",
    ),
    plannedWrite(sqliteRel, await pathExists(sqlitePath), "derived_index_rebuild"),
  ];
  if (options.vector) {
    plannedWrites.push(
      plannedWrite(vectorRel, await pathExists(vectorPath), "derived_vector_index_rebuild"),
    );
  }

  const beforeHashes = await hashWriteTargets(projectRoot, plannedWrites);
  const inspection = await inspectionWithManuscriptIndex(
    projectRoot,
    initialInspection,
    rebuiltManuscriptIndex,
  );
  const vectorIndex = options.vector
    ? await buildVectorIndex(projectRoot, inspection)
    : null;

  if (!dryRun) {
    await writeYaml(projectRoot, manuscriptIndexRel, rebuiltManuscriptIndex);
    await writeSqliteIndex(sqlitePath, inspection);

    if (vectorIndex) {
      await writeText(projectRoot, vectorRel, `${JSON.stringify(vectorIndex, null, 2)}\n`);
    }
  }

  const writes = dryRun
    ? []
    : await actualWritesFromHashes(projectRoot, plannedWrites, beforeHashes);
  const resultInspection = dryRun
    ? inspection
    : await inspectProject(projectRoot, { includeIndexWarning: false });

  return {
    projectRoot,
    projectId: resultInspection.config.project.id,
    sources: resultInspection.sources,
    writes,
    data: {
      dry_run: dryRun,
      planned_writes: dryRun ? plannedWrites : [],
      chapters_indexed: resultInspection.manuscriptIndex.chapters.length,
      manuscript_index: manuscriptIndexRel,
      sqlite_index: sqliteRel,
      vector_index: options.vector ? vectorRel : null,
      vector_documents_indexed: vectorIndex?.documents.length ?? 0,
    },
  };
}

function plannedWrite(
  writePath: string,
  existed: boolean,
  reason: string,
): EnvelopeWrite {
  return {
    path: writePath,
    change_type: existed ? "replaced" : "created",
    reason,
  };
}

async function hashWriteTargets(
  projectRoot: string,
  writes: EnvelopeWrite[],
): Promise<Map<string, string | null>> {
  const hashes = new Map<string, string | null>();

  for (const write of writes) {
    const fullPath = path.join(projectRoot, write.path);
    hashes.set(write.path, (await pathExists(fullPath)) ? await sha256File(fullPath) : null);
  }

  return hashes;
}

async function actualWritesFromHashes(
  projectRoot: string,
  plannedWrites: EnvelopeWrite[],
  beforeHashes: Map<string, string | null>,
): Promise<EnvelopeWrite[]> {
  const writes: EnvelopeWrite[] = [];

  for (const plannedWrite of plannedWrites) {
    const fullPath = path.join(projectRoot, plannedWrite.path);
    if (!(await pathExists(fullPath))) {
      continue;
    }

    const beforeHash = beforeHashes.get(plannedWrite.path) ?? null;
    const afterHash = await sha256File(fullPath);
    if (beforeHash === afterHash) {
      continue;
    }

    writes.push({
      ...plannedWrite,
      change_type: beforeHash ? "replaced" : "created",
    });
  }

  return writes;
}
