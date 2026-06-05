import type { EnvelopeSource } from "./envelope.js";
import type {
  ChapterOutline,
  ManuscriptIndex,
} from "./model.js";
import { titleFromTask, titleFromText } from "./title.js";
import {
  manuscriptPathForOrder,
  nextDisplayOrder,
  nextDraftablePlannedChapter,
  uniqueNewChapterId,
} from "./writing-targets.js";
import type {
  ConfirmedDraftPlan,
  WritingProjectState,
} from "./writing-types.js";

export function buildConfirmedDraftPlan(
  state: WritingProjectState,
  task: string,
  text: string,
  stamp: string,
): ConfirmedDraftPlan {
  const plannedChapter = nextDraftablePlannedChapter(state);
  const nextOrder = plannedChapter?.display_order ?? nextDisplayOrder(state.manuscriptIndex);
  const chapterId =
    plannedChapter?.id ?? uniqueNewChapterId(nextOrder, state.manuscriptIndex);
  const title =
    titleFromText(text) ??
    titleFromTask(task) ??
    plannedChapter?.title ??
    state.config.project.title ??
    `Chapter ${nextOrder}`;
  const sourcePath = manuscriptPathForOrder(nextOrder);
  const runRelPath = `runs/run_${stamp}_draft_confirmed.json`;

  return {
    runRelPath,
    sourcePath,
    target: {
      id: chapterId,
      display_order: nextOrder,
      title,
      source_path: sourcePath,
    },
    filledPlannedChapter: plannedChapter !== null,
    plannedChapterId: plannedChapter?.id ?? null,
    writes: [
      {
        path: sourcePath,
        change_type: "created",
        reason: "confirmed_draft_chapter",
      },
      {
        path: "outline/chapters.yaml",
        change_type: "modified",
        reason: "confirmed_draft_chapter_outline",
      },
      {
        path: ".openathor/manuscript.index.yaml",
        change_type: "modified",
        reason: "confirmed_draft_chapter_index",
      },
      {
        path: runRelPath,
        change_type: "created",
        reason: "confirmed_draft_run_record",
      },
    ],
  };
}

export function confirmedDraftUpdates(input: {
  state: WritingProjectState;
  plan: ConfirmedDraftPlan;
  contentHash: string;
  generatedAt: string;
}): {
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
} {
  const plan = input.plan;
  const target = plan.target;

  return {
    chapters: {
      chapters: plan.plannedChapterId
        ? input.state.chapters.chapters.map((chapter) =>
            chapter.id === plan.plannedChapterId
              ? {
                  ...chapter,
                  title: target.title,
                  status: "drafted" as const,
                  manuscript_path: target.source_path,
                }
              : chapter,
          )
        : [
            ...input.state.chapters.chapters,
            {
              id: target.id,
              display_order: target.display_order,
              title: target.title,
              status: "drafted" as const,
              manuscript_path: target.source_path,
            },
          ],
    },
    manuscriptIndex: {
      ...input.state.manuscriptIndex,
      generated_at: input.generatedAt,
      chapters: [
        ...input.state.manuscriptIndex.chapters,
        {
          id: target.id,
          display_order: target.display_order,
          title: target.title,
          source_path: target.source_path,
          status: "drafted",
          origin: "created",
          content_hash: input.contentHash,
          detected_title: target.title,
          confidence: "high",
        },
      ],
    },
  };
}

export function confirmedDraftRunRecord(input: {
  task: string;
  plan: ConfirmedDraftPlan;
  contentHash: string;
  sources: EnvelopeSource[];
  createdAt: string;
}): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    command: "openathor draft",
    created_at: input.createdAt,
    task: input.task,
    mode: "confirmed_write",
    filled_planned_chapter: input.plan.filledPlannedChapter,
    target: input.plan.target,
    source_hash: input.contentHash,
    writes: input.plan.writes,
    sources: input.sources,
    user_confirmation_required: false,
  };
}

export function confirmedDraftResultData(input: {
  dryRun: boolean;
  task: string;
  plan: ConfirmedDraftPlan;
  contentHash: string | null;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: "confirmed_write",
    command: "openathor draft",
    task: input.task,
    filled_planned_chapter: input.plan.filledPlannedChapter,
    target: input.plan.target,
    source_hash: input.contentHash,
    planned_writes: input.dryRun ? input.plan.writes : [],
    run_path: input.plan.runRelPath,
    user_confirmation_required: false,
  };
}
