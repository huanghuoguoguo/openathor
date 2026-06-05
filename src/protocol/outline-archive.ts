import type { EnvelopeSource, EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutlineEntry,
  IndexedChapter,
  ResolvedOutlineChapter,
} from "./model.js";

export function archiveResult(
  target: ResolvedOutlineChapter,
  applied: boolean,
): {
  applied: boolean;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
  manuscript_file_deleted: false;
} {
  return {
    applied,
    outline_status: applied ? "archived" : target.outline_status,
    index_status: applied && target.indexedChapter ? "archived" : target.index_status,
    manuscript_file_deleted: false,
  };
}

export function archiveWrites(
  target: ResolvedOutlineChapter,
  alreadyArchived: boolean,
  runRelPath: string,
): EnvelopeWrite[] {
  if (alreadyArchived) {
    return [];
  }

  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_archive_status",
    },
  ];

  if (target.indexedChapter) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_archive_index_status",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_archive_run_record",
  });

  return writes;
}

export function archiveDiff(target: ResolvedOutlineChapter): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | null;
    to: string;
  }>;
} {
  const changes: Array<{
    path: string;
    field: string;
    from: string | null;
    to: string;
  }> = [
    {
      path: "outline/chapters.yaml",
      field: `chapters[${target.id}].status`,
      from: target.outline_status,
      to: "archived",
    },
  ];

  if (target.indexedChapter) {
    changes.push({
      path: ".openathor/manuscript.index.yaml",
      field: `chapters[${target.id}].status`,
      from: target.index_status,
      to: "archived",
    });
  }

  return {
    summary: "Archive chapter metadata only; manuscript file is kept in place.",
    changes,
  };
}

export function archiveSources(
  sources: EnvelopeSource[],
  sourcePath: string | null,
): EnvelopeSource[] {
  const relevant = new Set([
    "outline/chapters.yaml",
    ".openathor/manuscript.index.yaml",
    ...(sourcePath ? [sourcePath] : []),
  ]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}
