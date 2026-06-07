import type { EnvelopeSource } from "./envelope.js";
import type {
  WritingProposalKind,
  WritingProposalOptions,
} from "./model.js";
import {
  isPlainRecord,
  stringArray,
} from "./value.js";
import {
  reviewPackNextAction,
  type ReviewPack,
} from "./review-pack.js";
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
  reviewPack?: ReviewPack | null;
}): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    operator_mode: input.reviewPack ? "sub-agent" : "single-agent",
    command: input.plan.command,
    created_at: input.createdAt,
    task: input.task,
    target: input.target,
    sources: input.sources,
    writes: input.plan.writes,
    mode: "proposal",
    review_pack: input.reviewPack ?? null,
    user_confirmation_required: true,
  };
}

export function writingProposalText(input: {
  kind: WritingProposalKind;
  task: string;
  stamp: string;
  target: WritingTarget | null;
  contextPack?: unknown;
  reviewPack?: ReviewPack | null;
}): string {
  if (input.kind === "canon_sync") {
    return canonPendingProposalText(input.task, input.stamp, input.target);
  }

  return proposalMarkdown(
    input.kind,
    input.task,
    input.stamp,
    input.target,
    input.contextPack,
    input.reviewPack,
  );
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
  reviewPack?: ReviewPack | null;
}): Record<string, unknown> {
  const reviewPack = input.reviewPack ?? null;

  return {
    dry_run: input.dryRun,
    mode: input.diff ? "diff" : "proposal",
    operator_mode: reviewPack ? "sub-agent" : "single-agent",
    command: input.plan.command,
    task: input.task,
    target: input.target,
    context_pack: input.contextPack,
    style_guidance: styleGuidanceFromContextPack(input.contextPack),
    review_pack: reviewPack,
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
    next_agent_action: reviewPackNextAction(reviewPack) ?? proposalNextAction(input.kind),
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
  contextPack?: unknown,
  reviewPack?: ReviewPack | null,
): string {
  return [
    `# ${proposalTitle(kind)}`,
    "",
    `- run: ${stamp}`,
    "- mode: proposal",
    `- operator_mode: ${reviewPack ? "sub-agent" : "single-agent"}`,
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
    ...proposalReviewPackMarkdown(reviewPack ?? null),
    ...proposalStyleGuidanceMarkdown(kind, contextPack),
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

function proposalStyleGuidanceMarkdown(
  kind: WritingProposalKind,
  contextPack: unknown,
): string[] {
  if (kind !== "draft" && kind !== "review" && kind !== "revise") {
    return [];
  }

  const guidance = styleGuidanceFromContextPack(contextPack);
  if (!isPlainRecord(guidance)) {
    return [];
  }

  const rules = isPlainRecord(guidance.rules) ? guidance.rules : {};
  const doRules = stringArray(rules.do).slice(0, 8);
  const avoidRules = stringArray(rules.avoid).slice(0, 8);

  return [
    "## Style Guidance",
    "",
    `- active_profile_present: ${Boolean(guidance.active_profile_present)}`,
    `- active_profile_id: ${stringOrNone(guidance.active_profile_id)}`,
    `- pending_profiles_excluded: ${Boolean(readNestedValue(guidance, ["safety", "pending_profiles_excluded"]))}`,
    `- reference_text_included: ${Boolean(readNestedValue(guidance, ["safety", "reference_text_included"]))}`,
    "",
    "### Do",
    "",
    ...(doRules.length > 0 ? doRules.map((rule) => `- ${rule}`) : ["- No confirmed do-rules available."]),
    "",
    "### Avoid",
    "",
    ...(avoidRules.length > 0 ? avoidRules.map((rule) => `- ${rule}`) : ["- No confirmed avoid-rules available."]),
    "",
  ];
}

function proposalReviewPackMarkdown(reviewPack: ReviewPack | null): string[] {
  if (!reviewPack) {
    return [];
  }

  return [
    "## Multi-agent Review Pack",
    "",
    `- mode: ${reviewPack.mode}`,
    `- coordinator_role: ${reviewPack.coordinator_role}`,
    "- sub_agents_may_write_manuscript: false",
    "- sub_agents_may_write_confirmed_canon: false",
    "",
    "### Roles",
    "",
    ...reviewPack.roles.flatMap((role) => [
      `#### ${role.id}`,
      "",
      `- phase: ${role.phase}`,
      `- label: ${role.label}`,
      "- focus:",
      ...role.focus.map((item) => `  - ${item}`),
      "- required_sources:",
      ...role.required_sources.map((item) => `  - ${item}`),
      "- must_not:",
      ...role.must_not.map((item) => `  - ${item}`),
      "",
    ]),
    "### Finding Output Schema",
    "",
    "```yaml",
    "role: <role-id>",
    "findings:",
    "  - severity: high | medium | low",
    "    issue: <short issue statement>",
    "    evidence:",
    "      - path: <source file path>",
    "        detail: <brief source-backed detail>",
    "    suggestion: <actionable next step>",
    "    status: finding | question",
    "```",
    "",
    "### Merge Policy",
    "",
    ...reviewPack.merge_policy.map((item) => `- ${item}`),
    "",
  ];
}

function styleGuidanceFromContextPack(contextPack: unknown): unknown {
  return readNestedValue(contextPack, ["style_guidance"]);
}

function readNestedValue(data: unknown, path: string[]): unknown {
  let current = data;

  for (const segment of path) {
    if (!isPlainRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function stringOrNone(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "none";
}
