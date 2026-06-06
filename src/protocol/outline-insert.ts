import type { EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  ManuscriptIndex,
  ResolvedOutlineChapter,
} from "./model.js";
import { outlineOrderSources } from "./outline-order-sources.js";

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

export const insertSources = outlineOrderSources;
