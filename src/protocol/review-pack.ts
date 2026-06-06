import { OpenAthorError } from "./errors.js";
import type { WritingProposalOptions } from "./model.js";
import type { WritingTarget } from "./writing-types.js";

export type ReviewRoleDefinition = {
  id: string;
  phase: "evidence" | "review" | "judge";
  label: string;
  focus: string[];
  required_sources: string[];
  must_not: string[];
};

export type ReviewPack = {
  mode: "multi_agent_review";
  operator_mode: "sub-agent";
  coordinator_role: "operator-agent";
  target: WritingTarget | null;
  roles: ReviewRoleDefinition[];
  finding_schema: {
    role: string;
    findings: Array<{
      severity: "high | medium | low";
      issue: string;
      evidence: Array<{
        path: string;
        detail: string;
      }>;
      suggestion: string;
      status: "finding | question";
    }>;
  };
  merge_policy: string[];
  safety: {
    sub_agents_may_write_manuscript: false;
    sub_agents_may_write_confirmed_canon: false;
    final_decision_owner: "operator-agent";
    user_confirmation_required_for_revise: true;
  };
};

const REVIEW_ROLES: ReviewRoleDefinition[] = [
  {
    id: "context-scout",
    phase: "evidence",
    label: "Context Scout",
    focus: [
      "find relevant prior chapters, notes, assets, and unresolved hooks",
      "separate confirmed facts from pending or inferred facts",
      "return source paths for every important claim",
    ],
    required_sources: [
      "context_pack.manuscript",
      "context_pack.confirmed_canon",
      "context_pack.notes",
      "context_pack.outline",
    ],
    must_not: [
      "judge prose quality",
      "invent missing evidence",
      "write manuscript or canon files",
    ],
  },
  {
    id: "continuity-reviewer",
    phase: "review",
    label: "Continuity Reviewer",
    focus: [
      "check canon, timeline, character state, item state, and hook continuity",
      "flag contradictions against confirmed sources",
      "mark uncertain model inference as questions instead of facts",
    ],
    required_sources: [
      "context_pack.confirmed_canon",
      "context_pack.characters",
      "context_pack.timeline",
      "context_pack.manuscript",
    ],
    must_not: [
      "treat pending canon as confirmed",
      "rewrite the target chapter",
      "silently resolve contradictions",
    ],
  },
  {
    id: "outline-planner",
    phase: "review",
    label: "Outline Planner",
    focus: [
      "check chapter goal, scene order, pacing, reveal timing, and unresolved setup/payoff",
      "identify structure changes that would need outline impact review",
      "keep suggestions local unless the task asks for replan",
    ],
    required_sources: [
      "context_pack.outline",
      "context_pack.manuscript",
      "context_pack.notes",
    ],
    must_not: [
      "move or archive chapters",
      "change stable chapter IDs",
      "skip impact analysis for structural changes",
    ],
  },
  {
    id: "style-editor",
    phase: "review",
    label: "Style Editor",
    focus: [
      "check fit with confirmed active style profile",
      "flag avoid-rule violations and obvious drift",
      "recommend abstract style adjustments without copying reference phrasing",
    ],
    required_sources: [
      "context_pack.style_guidance",
      "context_pack.style",
      "context_pack.manuscript",
    ],
    must_not: [
      "use pending style profiles as guidance",
      "copy reference text phrasing",
      "claim to imitate a named author",
    ],
  },
  {
    id: "reader-qa",
    phase: "review",
    label: "Reader QA",
    focus: [
      "identify reader confusion, motivation gaps, weak stakes, and boring passages",
      "prioritize issues that affect comprehension or emotional payoff",
      "ground each issue in the chapter text",
    ],
    required_sources: [
      "context_pack.manuscript",
      "context_pack.outline",
      "context_pack.notes",
    ],
    must_not: [
      "optimize for personal taste without evidence",
      "rewrite the chapter",
      "ignore explicit user constraints",
    ],
  },
  {
    id: "qa-judge",
    phase: "judge",
    label: "QA Judge",
    focus: [
      "score the merged review against evidence quality and task fit",
      "flag missing sources, duplicated findings, and overconfident claims",
      "verify safety, canon consistency, context use, and change control",
    ],
    required_sources: [
      "role findings",
      "context_pack",
      "review proposal",
    ],
    must_not: [
      "redo the review from scratch",
      "give credit just because sub-agents were used",
      "override deterministic failures",
    ],
  },
];

const REVIEW_ROLE_BY_ID = new Map(REVIEW_ROLES.map((role) => [role.id, role]));
const DEFAULT_REVIEW_ROLE_IDS = REVIEW_ROLES.map((role) => role.id);

export function normalizeReviewRoleIds(
  options: Pick<WritingProposalOptions, "kind" | "multiAgent" | "reviewRoles">,
): string[] | null {
  const requested = options.reviewRoles ?? [];
  const enabled = Boolean(options.multiAgent) || requested.length > 0;

  if (!enabled) {
    return null;
  }

  if (options.kind !== "review") {
    throw new OpenAthorError(
      "OA_REVIEW_PACK_UNSUPPORTED_COMMAND",
      "--multi-agent and --review-role are only supported by openathor review.",
      { exitCode: 2 },
    );
  }

  const normalized = requested.length > 0 ? dedupe(requested) : DEFAULT_REVIEW_ROLE_IDS;
  const unknown = normalized.filter((roleId) => !REVIEW_ROLE_BY_ID.has(roleId));

  if (unknown.length > 0) {
    throw new OpenAthorError(
      "OA_REVIEW_ROLE_UNKNOWN",
      `Unknown review role(s): ${unknown.join(", ")}.`,
      {
        exitCode: 2,
        hints: [`Available roles: ${DEFAULT_REVIEW_ROLE_IDS.join(", ")}`],
      },
    );
  }

  return normalized;
}

export function buildReviewPack(input: {
  target: WritingTarget | null;
  roleIds: string[] | null;
}): ReviewPack | null {
  if (!input.roleIds) {
    return null;
  }

  return {
    mode: "multi_agent_review",
    operator_mode: "sub-agent",
    coordinator_role: "operator-agent",
    target: input.target,
    roles: input.roleIds.map((roleId) => REVIEW_ROLE_BY_ID.get(roleId)!),
    finding_schema: {
      role: "role id",
      findings: [
        {
          severity: "high | medium | low",
          issue: "short issue statement",
          evidence: [
            {
              path: "source file path",
              detail: "brief source-backed detail",
            },
          ],
          suggestion: "actionable next step or revision direction",
          status: "finding | question",
        },
      ],
    },
    merge_policy: [
      "main operator agent owns the final user-facing review",
      "deduplicate findings by affected source and issue",
      "sort merged findings by severity before writing review notes",
      "preserve disagreements as questions instead of silently resolving them",
      "do not open revise or canon sync until the user confirms the review direction",
    ],
    safety: {
      sub_agents_may_write_manuscript: false,
      sub_agents_may_write_confirmed_canon: false,
      final_decision_owner: "operator-agent",
      user_confirmation_required_for_revise: true,
    },
  };
}

export function reviewPackNextAction(reviewPack: ReviewPack | null): string | null {
  if (!reviewPack) {
    return null;
  }

  return "Dispatch the review pack to the listed roles, collect structured findings, then merge them into prioritized review notes. Sub-agents must not write manuscript or confirmed canon files.";
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
