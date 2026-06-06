import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import type {
  OutlineReplanPlan,
  ResolvedOutlineChapter,
} from "./model.js";

export function replanWrites(
  affected: Array<{ source_path: string | null }>,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "future_outline_replan_metadata",
    },
  ];

  if (affected.some((chapter) => chapter.source_path)) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "future_outline_replan_index",
    });
  }

  return writes;
}

export function replanConfirmedWrites(runRelPath: string): EnvelopeWrite[] {
  return [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "confirmed_outline_replan_metadata",
    },
    {
      path: runRelPath,
      change_type: "created",
      reason: "confirmed_outline_replan_run_record",
    },
  ];
}

export function replanDiff(
  from: ResolvedOutlineChapter,
  affected: Array<{
    id: string;
    display_order: number;
    title: string;
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
      "Proposal only: define a replan boundary and affected chapters; no files are changed.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: "replan_from",
        from: null,
        to: from.id,
      },
      ...affected.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}].review_for_replan`,
        from: chapter.display_order,
        to: chapter.title,
      })),
    ],
  };
}

export function replanPackageDiff(
  from: ResolvedOutlineChapter,
  plan: OutlineReplanPlan,
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
      "Replace planned future outline chapters from the replan boundary; no manuscript files are changed.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: "replan_from",
        from: null,
        to: from.id,
      },
      ...plan.replaced_chapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `remove_or_replace[${chapter.id}]`,
        from: chapter.title,
        to: null,
      })),
      ...plan.replacement_chapters.map((chapter) => ({
        path: "outline/chapters.yaml",
        field: `chapters[${chapter.id}]`,
        from: null,
        to: chapter.title,
      })),
    ],
  };
}

export function replanResult(
  plan: OutlineReplanPlan,
  applied: boolean,
): {
  applied: boolean;
  outline_modified: boolean;
  index_modified: false;
  manuscript_files_modified: false;
  replaced_chapter_count: number;
  replacement_chapter_count: number;
  archived_index_chapter_count: number;
} {
  return {
    applied,
    outline_modified: applied,
    index_modified: false,
    manuscript_files_modified: false,
    replaced_chapter_count: plan.replaced_chapters.length,
    replacement_chapter_count: plan.replacement_chapters.length,
    archived_index_chapter_count: plan.archived_index_chapters.length,
  };
}

export function replanSources(sources: EnvelopeSource[]): EnvelopeSource[] {
  const relevant = new Set(["outline/chapters.yaml", ".openathor/manuscript.index.yaml"]);

  return sources
    .filter((source) => relevant.has(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}
