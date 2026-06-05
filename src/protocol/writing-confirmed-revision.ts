import type { EnvelopeSource } from "./envelope.js";
import type {
  ChapterOutline,
  IndexedChapter,
  ManuscriptIndex,
} from "./model.js";
import { titleFromText } from "./title.js";
import type {
  ConfirmedRevisionPlan,
  WritingProjectState,
} from "./writing-types.js";

export function buildConfirmedRevisionPlan(input: {
  chapter: IndexedChapter;
  text: string;
  baseHash: string;
  stamp: string;
}): ConfirmedRevisionPlan {
  const title = titleFromText(input.text) ?? input.chapter.title;
  const runRelPath = `runs/run_${input.stamp}_revise_confirmed.json`;

  return {
    runRelPath,
    target: {
      id: input.chapter.id,
      display_order: input.chapter.display_order,
      title,
      source_path: input.chapter.source_path,
    },
    baseHash: input.baseHash,
    writes: [
      {
        path: input.chapter.source_path,
        change_type: "modified",
        reason: "confirmed_revision",
      },
      {
        path: "outline/chapters.yaml",
        change_type: "modified",
        reason: "confirmed_revision_outline",
      },
      {
        path: ".openathor/manuscript.index.yaml",
        change_type: "modified",
        reason: "confirmed_revision_index",
      },
      {
        path: runRelPath,
        change_type: "created",
        reason: "confirmed_revision_run_record",
      },
    ],
  };
}

export function confirmedRevisionUpdates(input: {
  state: WritingProjectState;
  plan: ConfirmedRevisionPlan;
  contentHash: string;
  generatedAt: string;
}): {
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
} {
  const target = input.plan.target;

  return {
    chapters: {
      chapters: input.state.chapters.chapters.map((outlineChapter) =>
        outlineChapter.id === target.id
          ? {
              ...outlineChapter,
              title: target.title,
              status: "revised",
              manuscript_path: target.source_path,
            }
          : outlineChapter,
      ),
    },
    manuscriptIndex: {
      ...input.state.manuscriptIndex,
      generated_at: input.generatedAt,
      chapters: input.state.manuscriptIndex.chapters.map((indexedChapter) =>
        indexedChapter.id === target.id
          ? {
              ...indexedChapter,
              title: target.title,
              status: "revised",
              content_hash: input.contentHash,
              detected_title: target.title,
            }
          : indexedChapter,
      ),
    },
  };
}

export function confirmedRevisionRunRecord(input: {
  task: string;
  plan: ConfirmedRevisionPlan;
  sources: EnvelopeSource[];
  createdAt: string;
}): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    command: "openathor revise",
    created_at: input.createdAt,
    task: input.task,
    mode: "confirmed_write",
    target: input.plan.target,
    base_hash: input.plan.baseHash,
    writes: input.plan.writes,
    sources: input.sources,
    user_confirmation_required: false,
  };
}

export function confirmedRevisionResultData(input: {
  dryRun: boolean;
  task: string;
  plan: ConfirmedRevisionPlan;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: "confirmed_write",
    command: "openathor revise",
    task: input.task,
    target: input.plan.target,
    base_hash: input.plan.baseHash,
    planned_writes: input.dryRun ? input.plan.writes : [],
    run_path: input.plan.runRelPath,
    user_confirmation_required: false,
  };
}
