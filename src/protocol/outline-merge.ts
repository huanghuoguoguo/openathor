import type { EnvelopeWrite } from "./envelope.js";
import type { ResolvedOutlineChapter } from "./model.js";
import { outlineTargetData } from "./outline-target.js";
import { snippetAround } from "./text-analysis.js";

export function mergePlan(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  title: string,
  targetText: string | undefined,
  nextText: string | undefined,
  maxChars: number,
): {
  title: string;
  kept_chapter_id: string;
  archived_chapter_id: string;
  display_order: number;
  source_paths: string[];
  preview: string;
} {
  const preview = [targetText ?? target.title, nextText ?? next.title]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  return {
    title,
    kept_chapter_id: target.id,
    archived_chapter_id: next.id,
    display_order: target.display_order,
    source_paths: [target.source_path, next.source_path].filter(
      (value): value is string => Boolean(value),
    ),
    preview: snippetAround(preview, 0, 0, maxChars),
  };
}

export function mergeProposalData(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  targetHash: string | null,
  nextHash: string | null,
  plan: ReturnType<typeof mergePlan>,
  dryRun: boolean,
  diff: boolean,
  previewOnly: boolean,
  plannedWrites: EnvelopeWrite[],
): {
  dry_run: boolean;
  mode: "proposal" | "diff" | "confirmed_write";
  command: "openathor outline merge";
  target: ReturnType<typeof outlineTargetData>;
  next: ReturnType<typeof outlineTargetData>;
  merged: ReturnType<typeof mergePlan>;
  result: {
    applied: boolean;
    manuscript_file_modified: boolean;
    manuscript_files_deleted: false;
    outline_modified: boolean;
    index_modified: boolean;
  };
  user_confirmation_required: boolean;
  confirmed_write_supported: boolean;
  planned_writes: EnvelopeWrite[];
  diff: ReturnType<typeof mergeDiff>;
  next_agent_action: string;
} {
  return {
    dry_run: dryRun,
    mode: previewOnly ? (diff ? "diff" : "proposal") : "confirmed_write",
    command: "openathor outline merge",
    target: outlineTargetData(target, targetHash),
    next: outlineTargetData(next, nextHash),
    merged: plan,
    result: {
      applied: false,
      manuscript_file_modified: false,
      manuscript_files_deleted: false,
      outline_modified: false,
      index_modified: false,
    },
    user_confirmation_required: previewOnly,
    confirmed_write_supported: true,
    planned_writes: previewOnly ? plannedWrites : [],
    diff: mergeDiff(target, next, plan, previewOnly),
    next_agent_action: previewOnly
      ? "Show the merge proposal to the user and rerun with --confirm plus both source hashes after explicit approval."
      : "Run openathor outline show --json and refresh context before follow-up writing.",
  };
}

export function mergeWrites(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  runRelPath: string,
): EnvelopeWrite[] {
  const writes: EnvelopeWrite[] = [
    {
      path: "outline/chapters.yaml",
      change_type: "modified",
      reason: "outline_merge_metadata",
    },
  ];

  if (target.indexedChapter || next.indexedChapter) {
    writes.push({
      path: ".openathor/manuscript.index.yaml",
      change_type: "modified",
      reason: "outline_merge_index",
    });
  }

  if (target.source_path) {
    writes.push({
      path: target.source_path,
      change_type: "modified",
      reason: "outline_merge_manuscript_source",
    });
  }

  writes.push({
    path: runRelPath,
    change_type: "created",
    reason: "outline_merge_run_record",
  });

  return writes;
}

export function mergeDiff(
  target: ResolvedOutlineChapter,
  next: ResolvedOutlineChapter,
  plan: ReturnType<typeof mergePlan>,
  previewOnly = true,
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
    summary: previewOnly
      ? "Preview: merge adjacent chapters into one kept chapter; no files are changed."
      : "Confirmed: merge adjacent chapters into one kept chapter and archive the next chapter.",
    changes: [
      {
        path: "outline/chapters.yaml",
        field: `chapters[${target.id}].title`,
        from: target.title,
        to: plan.title,
      },
      {
        path: "outline/chapters.yaml",
        field: `chapters[${next.id}].status`,
        from: next.outline_status,
        to: "archived",
      },
      {
        path: ".openathor/manuscript.index.yaml",
        field: `chapters[${next.id}].status`,
        from: next.index_status,
        to: "archived",
      },
    ],
  };
}

export function mergedChapterText(title: string, targetText: string, nextText: string): string {
  const targetBody = stripMarkdownHeading(targetText).trim();
  const nextBody = stripMarkdownHeading(nextText).trim();

  return [
    `# ${title}`,
    "",
    targetBody,
    "",
    "<!-- merged-from-next-chapter -->",
    "",
    nextBody,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export function mergedSummary(
  targetSummary: string | undefined,
  nextSummary: string | undefined,
): string | undefined {
  const parts = [targetSummary, nextSummary]
    .map((summary) => summary?.trim())
    .filter((summary): summary is string => Boolean(summary));

  return parts.length > 0 ? parts.join(" / ") : undefined;
}

export function mergeOutlineLinks(
  targetLinks: Record<string, unknown> | undefined,
  nextLinks: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!targetLinks && !nextLinks) {
    return undefined;
  }

  const merged: Record<string, unknown> = { ...(targetLinks ?? {}) };

  for (const [key, value] of Object.entries(nextLinks ?? {})) {
    const current = merged[key];

    if (Array.isArray(current) || Array.isArray(value)) {
      merged[key] = uniqueUnknownArray([
        ...(Array.isArray(current) ? current : current === undefined ? [] : [current]),
        ...(Array.isArray(value) ? value : value === undefined ? [] : [value]),
      ]);
      continue;
    }

    if (current === undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

function stripMarkdownHeading(text: string): string {
  return text.replace(/^#\s+.+(?:\r?\n|$)/u, "");
}

function uniqueUnknownArray(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result = [];

  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}
