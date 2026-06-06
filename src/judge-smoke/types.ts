import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import type { FixtureCheckResult } from "../fixture-check.js";

export type JudgeDimension =
  | "task_success"
  | "safety"
  | "canon_consistency"
  | "context_use"
  | "change_control"
  | "user_experience"
  | "writing_fit";

export type SmokeScenario = {
  name: string;
  fixture: string;
  user_task: string;
  expected_agent_reply: string;
  judge_focus: JudgeDimension[];
};

export type JudgePlaceholder = {
  verdict: "needs_review" | "pass" | "fail";
  blocking_failures: string[];
  scores: Record<JudgeDimension, number | null>;
  missing_evidence: string[];
  judge_model?: string;
  notes?: string;
};

export type JudgeEvidencePackage = {
  schema_version: "openathor.judge_evidence.v1";
  scenario: string;
  fixture: string;
  user_task: string;
  operator_agent: {
    name: "openathor-judge-smoke";
    mode: "deterministic_fixture_runner";
    model: null;
  };
  operator_transcript?: {
    path: string;
    text: string;
  };
  deterministic_check: {
    ok: boolean;
    fixture_workspace: string;
    command_count: number;
    commands: Array<{
      command: string;
      ok: boolean;
      error_code: string | null;
      writes: OpenAthorEnvelope["writes"];
      warnings: OpenAthorEnvelope["warnings"];
    }>;
    file_changes: FixtureCheckResult["file_changes"];
    required_files: string[];
    absent_files: string[];
    unchanged_files: string[];
  };
  agent_final_response: string;
  judge_focus: JudgeDimension[];
  judge: JudgePlaceholder;
};

export type JudgeScoresAttachment = {
  verdict: "pass" | "fail" | "needs_review";
  blocking_failures: string[];
  scores: Record<JudgeDimension, number>;
  judge_model?: string;
  notes?: string;
};

export type JudgeSmokeResult = {
  scenario_count: number;
  evidence_packages: JudgeEvidencePackage[];
  evidence_files: string[];
};

export type JudgeSmokeAttachmentInputs = {
  operatorTranscript?: { path: string; text: string };
  agentFinalResponse?: { path: string; text: string };
  judgeScores?: JudgeScoresAttachment;
};
