import type { EnvelopeSource, EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutline,
  ChapterOutlineEntry,
  IndexedChapter,
  ManuscriptIndex,
  ProjectConfig,
  WritingProposalKind,
  WritingProposalOptions,
} from "./model.js";
import { titleFromTask, titleFromText } from "./title.js";

export type WritingTarget = {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
};

export type WritingProjectState = {
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
};

export type WritingProposalPlan = {
  command: string;
  runRelPath: string;
  proposalRelPath: string;
  writes: EnvelopeWrite[];
};

export type ConfirmedDraftPlan = {
  runRelPath: string;
  sourcePath: string;
  target: WritingTarget;
  filledPlannedChapter: boolean;
  plannedChapterId: string | null;
  writes: EnvelopeWrite[];
};

export type ConfirmedRevisionPlan = {
  runRelPath: string;
  target: WritingTarget;
  baseHash: string;
  writes: EnvelopeWrite[];
};

export function proposalNeedsChapter(
  options: Pick<WritingProposalOptions, "kind" | "target">,
): boolean {
  if (options.kind === "draft" && options.target === "next") {
    return false;
  }

  return options.kind === "draft" || options.kind === "review" || options.kind === "revise";
}

export function proposalCommandName(kind: WritingProposalKind): string {
  if (kind === "canon_sync") {
    return "openathor canon sync";
  }

  return `openathor ${kind}`;
}

export function nextDraftTargetPreview(
  state: WritingProjectState,
  task: string,
): WritingTarget {
  const plannedChapter = nextDraftablePlannedChapter(state);
  const nextOrder = plannedChapter?.display_order ?? nextDisplayOrder(state.manuscriptIndex);
  const chapterId =
    plannedChapter?.id ?? uniqueNewChapterId(nextOrder, state.manuscriptIndex);
  const title =
    titleFromTask(task) ??
    plannedChapter?.title ??
    state.config.project.title ??
    `Chapter ${nextOrder}`;

  return {
    id: chapterId,
    display_order: nextOrder,
    title,
    source_path: manuscriptPathForOrder(nextOrder),
  };
}

export function buildWritingProposalPlan(input: {
  kind: WritingProposalKind;
  stamp: string;
  target: WritingTarget | null;
  proposalExists: boolean;
}): WritingProposalPlan {
  const runRelPath = `runs/run_${input.stamp}_${input.kind}.json`;
  const proposalRelPath = proposalPath(input.kind, input.stamp, input.target);

  return {
    command: proposalCommandName(input.kind),
    runRelPath,
    proposalRelPath,
    writes: [
      {
        path: runRelPath,
        change_type: "created",
        reason: `${input.kind}_run_record`,
      },
      {
        path: proposalRelPath,
        change_type: input.proposalExists ? "modified" : "created",
        reason: `${input.kind}_proposal`,
      },
    ],
  };
}

export function writingProposalPath(
  kind: WritingProposalKind,
  stamp: string,
  target: WritingTarget | null,
): string {
  return proposalPath(kind, stamp, target);
}

export function writingProposalRunRecord(input: {
  plan: WritingProposalPlan;
  task: string;
  target: WritingTarget | null;
  sources: EnvelopeSource[];
  createdAt: string;
}): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    command: input.plan.command,
    created_at: input.createdAt,
    task: input.task,
    target: input.target,
    sources: input.sources,
    writes: input.plan.writes,
    mode: "proposal",
    user_confirmation_required: true,
  };
}

export function writingProposalText(input: {
  kind: WritingProposalKind;
  task: string;
  stamp: string;
  target: WritingTarget | null;
}): string {
  if (input.kind === "canon_sync") {
    return canonPendingProposalText(input.task, input.stamp, input.target);
  }

  return proposalMarkdown(input.kind, input.task, input.stamp, input.target);
}

export function writingProposalData(input: {
  dryRun: boolean;
  kind: WritingProposalKind;
  task: string;
  target: WritingTarget | null;
  contextPack: unknown;
  plan: WritingProposalPlan;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: "proposal",
    command: input.plan.command,
    task: input.task,
    target: input.target,
    context_pack: input.contextPack,
    planned_writes: input.dryRun ? input.plan.writes : [],
    proposal_path: input.plan.proposalRelPath,
    run_path: input.plan.runRelPath,
    user_confirmation_required: true,
    next_agent_action: proposalNextAction(input.kind),
  };
}

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
    writes: input.plan.writes,
    sources: input.sources,
    user_confirmation_required: false,
  };
}

export function confirmedDraftResultData(input: {
  dryRun: boolean;
  task: string;
  plan: ConfirmedDraftPlan;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: "confirmed_write",
    command: "openathor draft",
    task: input.task,
    filled_planned_chapter: input.plan.filledPlannedChapter,
    target: input.plan.target,
    planned_writes: input.dryRun ? input.plan.writes : [],
    run_path: input.plan.runRelPath,
    user_confirmation_required: false,
  };
}

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

function nextDisplayOrder(index: ManuscriptIndex): number {
  const currentMax = index.chapters.reduce(
    (max, chapter) => Math.max(max, chapter.display_order),
    0,
  );
  return currentMax + 1;
}

function nextDraftablePlannedChapter(state: {
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
}): ChapterOutlineEntry | null {
  const indexedIds = new Set(state.manuscriptIndex.chapters.map((chapter) => chapter.id));

  return (
    [...state.chapters.chapters]
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
      .find(
        (chapter) =>
          chapter.status === "planned" &&
          !chapter.manuscript_path &&
          !indexedIds.has(chapter.id),
      ) ?? null
  );
}

function uniqueNewChapterId(order: number, index: ManuscriptIndex): string {
  const existing = new Set(index.chapters.map((chapter) => chapter.id));
  let candidate = `ch_${String(order).padStart(3, "0")}`;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `ch_${String(order).padStart(3, "0")}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function manuscriptPathForOrder(order: number): string {
  return `manuscript/chapter-${String(order).padStart(3, "0")}.md`;
}

function proposalPath(
  kind: WritingProposalKind,
  stamp: string,
  target: WritingTarget | null,
): string {
  const targetPart = target ? `${target.id}_` : "";

  if (kind === "plan") {
    return `notes/plan-${targetPart}${stamp}.md`;
  }

  if (kind === "draft") {
    return `notes/draft-${targetPart}${stamp}.md`;
  }

  if (kind === "review") {
    return `reviews/review-${targetPart}${stamp}.md`;
  }

  if (kind === "revise") {
    return `reviews/revise-${targetPart}${stamp}.md`;
  }

  return "bible/canon.pending.md";
}

function proposalMarkdown(
  kind: WritingProposalKind,
  task: string,
  stamp: string,
  target: WritingTarget | null,
): string {
  return [
    `# ${proposalTitle(kind)}`,
    "",
    `- run: ${stamp}`,
    "- mode: proposal",
    `- target: ${target ? `${target.id} (${target.title})` : "project"}`,
    `- source_path: ${target?.source_path ?? ""}`,
    "- user_confirmation_required: true",
    "",
    "## User Task",
    "",
    task,
    "",
    "## Agent Instructions",
    "",
    proposalNextAction(kind),
    "",
  ].join("\n");
}

function canonPendingProposalText(
  task: string,
  stamp: string,
  target: WritingTarget | null,
): string {
  return [
    "",
    `## pending_${stamp}: Canon Sync Proposal`,
    "",
    "- status: pending",
    `- source_ref: ${target?.id ?? "project"}`,
    `- source: ${target?.source_path ?? "context"}`,
    "- user_confirmation_required: true",
    "",
    "Task:",
    "",
    task,
    "",
  ].join("\n");
}

function proposalTitle(kind: WritingProposalKind): string {
  if (kind === "plan") {
    return "Plan Proposal";
  }

  if (kind === "draft") {
    return "Draft Task Package";
  }

  if (kind === "review") {
    return "Review Notes";
  }

  if (kind === "revise") {
    return "Revision Proposal";
  }

  return "Canon Sync Proposal";
}

function proposalNextAction(kind: WritingProposalKind): string {
  if (kind === "plan") {
    return "Use the context pack to propose outline or scene-level next steps for user confirmation.";
  }

  if (kind === "draft") {
    return "Use the context pack to draft text in the conversation or prepare a diff only after user confirmation.";
  }

  if (kind === "review") {
    return "Fill this review with prioritized issues grounded in the context pack and manuscript source.";
  }

  if (kind === "revise") {
    return "Prepare a local diff proposal; do not rewrite manuscript files without explicit user confirmation.";
  }

  return "Extract candidate facts into pending canon only; do not modify confirmed canon without user confirmation.";
}
