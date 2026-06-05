import type { EnvelopeWarning } from "./envelope.js";
import type { IndexedChapter } from "./model.js";

export type ActiveStyleProfileState = {
  activeProfile: Record<string, unknown> | null;
  profilesHash: string | null;
};

export function styleReviseTarget(
  chapter: IndexedChapter,
  sourceHash: string,
): {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
  content_hash: string;
} {
  return {
    id: chapter.id,
    display_order: chapter.display_order,
    title: chapter.title,
    source_path: chapter.source_path,
    content_hash: sourceHash,
  };
}

export function styleReviseWarnings(
  profileState: { activeProfile: Record<string, unknown> | null },
  styleCheckWarnings: EnvelopeWarning[] | undefined,
): EnvelopeWarning[] {
  const warnings = [...(styleCheckWarnings ?? [])];

  if (!profileState.activeProfile) {
    warnings.push({
      code: "OA_STYLE_ACTIVE_PROFILE_MISSING",
      message: "No confirmed active style profile was found; style revision can only use manual style guidance and deterministic checks.",
      severity: "low",
    });
  }

  return warnings;
}

export function styleReviseProposalMarkdown(input: {
  goal: string;
  target: IndexedChapter;
  sourceHash: string;
  profileState: ActiveStyleProfileState;
  styleCheckData: unknown;
  revisedText?: string;
}): string {
  const styleCheckSummary = styleCheckDataSummary(input.styleCheckData);

  return [
    "# Style Revision Proposal",
    "",
    `- target: ${input.target.id}`,
    `- display_order: ${input.target.display_order}`,
    `- source_path: ${input.target.source_path}`,
    `- source_hash: ${input.sourceHash}`,
    `- goal: ${input.goal}`,
    `- active_profile_id: ${String(input.profileState.activeProfile?.id ?? "none")}`,
    `- profiles_hash: ${input.profileState.profilesHash ?? "missing"}`,
    "- manuscript_generated_by_cli: false",
    "- user_confirmation_required: true",
    "",
    "## Style Check Summary",
    "",
    `- verdict: ${styleCheckSummary.verdict ?? "unknown"}`,
    `- finding_count: ${styleCheckSummary.findingCount}`,
    "",
    "## Revised Text",
    "",
    input.revisedText
      ? input.revisedText
      : "No revised text was supplied. Pi/Operator Agent should generate prose externally, show it to the user, then confirm with --text and --base-hash.",
    "",
  ].join("\n");
}

function styleCheckDataSummary(data: unknown): {
  verdict?: string;
  findingCount: number;
} {
  if (typeof data !== "object" || data === null) {
    return { findingCount: 0 };
  }

  const record = data as { verdict?: unknown; findings?: unknown };
  return {
    verdict: typeof record.verdict === "string" ? record.verdict : undefined,
    findingCount: Array.isArray(record.findings) ? record.findings.length : 0,
  };
}
