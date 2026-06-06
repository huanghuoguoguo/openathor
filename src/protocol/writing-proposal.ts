import type { EnvelopeSource } from "./envelope.js";
import type {
  WritingProposalKind,
  WritingProposalOptions,
} from "./model.js";
import type {
  WritingProposalPlan,
  WritingTarget,
} from "./writing-types.js";

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
  diff: boolean;
  kind: WritingProposalKind;
  task: string;
  target: WritingTarget | null;
  contextPack: unknown;
  plan: WritingProposalPlan;
  proposalText: string;
}): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: input.diff ? "diff" : "proposal",
    command: input.plan.command,
    task: input.task,
    target: input.target,
    context_pack: input.contextPack,
    planned_writes: input.dryRun || input.diff ? input.plan.writes : [],
    diff: input.diff
      ? {
          proposal_path: input.plan.proposalRelPath,
          proposal_text: input.proposalText,
        }
      : null,
    proposal_path: input.plan.proposalRelPath,
    run_path: input.plan.runRelPath,
    user_confirmation_required: true,
    next_agent_action: proposalNextAction(input.kind),
  };
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
