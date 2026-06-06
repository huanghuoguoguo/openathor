import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { ProjectInspection } from "./project-inspection-model.js";

export async function writeSqliteIndex(
  sqlitePath: string,
  inspection: ProjectInspection,
): Promise<void> {
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  await rm(sqlitePath, { force: true });

  const emitWarning = process.emitWarning;
  process.emitWarning = (() => undefined) as typeof process.emitWarning;
  const sqlite = await import("node:sqlite");
  process.emitWarning = emitWarning;
  const db = new sqlite.DatabaseSync(sqlitePath);

  try {
    db.exec(`
      CREATE TABLE project (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        protocol_version TEXT NOT NULL,
        source_policy TEXT NOT NULL
      );
      CREATE TABLE chapters (
        id TEXT PRIMARY KEY,
        display_order INTEGER NOT NULL,
        source_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        origin TEXT NOT NULL,
        confidence TEXT NOT NULL
      );
    `);

    db.prepare(
      "INSERT INTO project (id, title, protocol_version, source_policy) VALUES (?, ?, ?, ?)",
    ).run(
      inspection.config.project.id,
      inspection.config.project.title,
      inspection.config.protocol_version,
      inspection.config.project.source_policy,
    );

    const insertChapter = db.prepare(
      `INSERT INTO chapters
       (id, display_order, source_path, content_hash, status, origin, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const chapter of inspection.manuscriptIndex.chapters) {
      insertChapter.run(
        chapter.id,
        chapter.display_order,
        chapter.source_path,
        chapter.content_hash,
        chapter.status,
        chapter.origin,
        chapter.confidence,
      );
    }
  } finally {
    db.close();
  }
}
