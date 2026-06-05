import { OpenAthorError } from "./errors.js";
import type { EnvelopeSource, EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
  ResolvedOutlineChapter,
} from "./model.js";

export function insertResult(
  insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  },
  affectedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
  applied: boolean,
): {
  applied: boolean;
  inserted_chapter: typeof insertedChapter;
  affected_chapters: typeof affectedChapters;
  manuscript_file_created: false;
  manuscript_files_moved: false;
} {
  return {
    applied,
    inserted_chapter: insertedChapter,
    affected_chapters: affectedChapters,
    manuscript_file_created: false,
    manuscript_files_moved: false,
  };
}

export function insertAffectedChapters(
  chapters: ChapterOutline,
  manuscriptIndex: ManuscriptIndex,
  insertOrder: number,
): Array<{
  id: string;
  title: string;
  from_display_order: number;
  to_display_order: number;
  source_path: string | null;
}> {
  const indexedById = new Map(
    manuscriptIndex.chapters.map((chapter) => [chapter.id, chapter]),
  );

  return chapters.chapters
    .filter((chapter) => chapter.display_order >= insertOrder)
    .sort((a, b) => a.display_order - b.display_order)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      from_display_order: chapter.display_order,
      to_display_order: chapter.display_order + 1,
      source_path: indexedById.get(chapter.id)?.source_path ?? chapter.manuscript_path ?? null,
    }));
}

export function insertWrites(runRelPath: string, shiftsIndexedChapters: boolean): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_insert_planned_chapter",
    },
  ];

  if (shiftsIndexedChapters) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_insert_display_order_shift",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_insert_run_record",
  });

  return writes;
}

export function insertDiff(
  after: ResolvedOutlineChapter,
  insertedChapter: {
    id: string;
    display_order: number;
    title: string;
    status: ChapterOutlineEntry["status"];
    manuscript_path: string | null;
  },
  affectedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Insert a planned chapter in outline metadata; keep existing chapter ids and manuscript files in place.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `insert_after[${after.id}]`,
        from: null,
        to: insertedChapter.id,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${insertedChapter.id}].display_order`,
        from: null,
        to: insertedChapter.display_order,
      },
      ...affectedChapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].display_order`,
        from: chapter.from_display_order,
        to: chapter.to_display_order,
      })),
      ...affectedChapters
        .filter((chapter) => chapter.source_path)
        .map((chapter) => ({
          path: ".openathor/manuscript.index.yaml",
          field: `chapters[${chapter.id}].display_order`,
          from: chapter.from_display_order,
          to: chapter.to_display_order,
        })),
    ],
  };
}

export function insertSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  return outlineOrderSources(sources);
}

export function moveDisplayOrderChanges(
  chapters: ChapterOutline,
  targetId: string,
  afterId: string,
): Array<{
  id: string;
  title: string;
  from_display_order: number;
  to_display_order: number;
  status: ChapterOutlineEntry["status"];
  source_path: string | null;
}> {
  const ordered = [...chapters.chapters].sort(
    (a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id),
  );
  const targetIndex = ordered.findIndex((chapter) => chapter.id === targetId);
  const targetChapter = ordered[targetIndex];

  if (!targetChapter) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${targetId}.`,
      { exitCode: 2 },
    );
  }

  ordered.splice(targetIndex, 1);
  const afterIndex = ordered.findIndex((chapter) => chapter.id === afterId);

  if (afterIndex < 0) {
    throw new OpenAthorError(
      "OA_OUTLINE_TARGET_NOT_FOUND",
      `Cannot find outline chapter target ${afterId}.`,
      { exitCode: 2 },
    );
  }

  ordered.splice(afterIndex + 1, 0, targetChapter);

  return ordered
    .map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      from_display_order: chapter.display_order,
      to_display_order: index + 1,
      status: chapter.status,
      source_path: chapter.manuscript_path ?? null,
    }))
    .filter((chapter) => chapter.from_display_order !== chapter.to_display_order);
}

export function moveResult(
  target: ResolvedOutlineChapter,
  after: ResolvedOutlineChapter,
  movedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    status: ChapterOutlineEntry["status"];
    source_path: string | null;
  }>,
  applied: boolean,
): {
  applied: boolean;
  target: { id: string; from_display_order: number; to_display_order: number | null };
  after: { id: string; display_order: number };
  moved_chapters: typeof movedChapters;
  manuscript_files_moved: false;
} {
  const movedTarget = movedChapters.find((chapter) => chapter.id === target.id);

  return {
    applied,
    target: {
      id: target.id,
      from_display_order: target.display_order,
      to_display_order: movedTarget?.to_display_order ?? target.display_order,
    },
    after: {
      id: after.id,
      display_order: after.display_order,
    },
    moved_chapters: movedChapters,
    manuscript_files_moved: false,
  };
}

export function moveWrites(
  runRelPath: string,
  movedChapters: Array<{ source_path: string | null }>,
): EnvelopeWrite[] {
  if (movedChapters.length === 0) {
    return [];
  }

  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_move_display_order",
    },
  ];

  if (movedChapters.some((chapter) => chapter.source_path)) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_move_index_display_order",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_move_run_record",
  });

  return writes;
}

export function moveDiff(
  target: ResolvedOutlineChapter,
  after: ResolvedOutlineChapter,
  movedChapters: Array<{
    id: string;
    title: string;
    from_display_order: number;
    to_display_order: number;
    source_path: string | null;
  }>,
): {
  summary: string;
  changes: Array<{
    path: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
  }>;
} {
  return {
    summary:
      "Move chapter display order in outline metadata; keep chapter ids and manuscript files in place.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `move[${target.id}].after`,
        from: target.display_order,
        to: after.id,
      },
      ...movedChapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].display_order`,
        from: chapter.from_display_order,
        to: chapter.to_display_order,
      })),
      ...movedChapters
        .filter((chapter) => chapter.source_path)
        .map((chapter) => ({
          path: ".openathor/manuscript.index.yaml",
          field: `chapters[${chapter.id}].display_order`,
          from: chapter.from_display_order,
          to: chapter.to_display_order,
        })),
    ],
  };
}

export function moveSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  return outlineOrderSources(sources);
}

function outlineOrderSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}
