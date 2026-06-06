import { readFile } from "node:fs/promises";
import { OpenAthorError } from "../protocol/errors.js";
import type { FixtureCheckResult } from "../fixture-check.js";
import { scoreDimensions } from "./scenarios.js";
import type {
  JudgeEvidencePackage,
  JudgeSmokeAttachmentInputs,
  SmokeScenario,
} from "./types.js";

export function buildEvidencePackage(
  scenario: SmokeScenario,
  fixtureResult: FixtureCheckResult,
  attachments: JudgeSmokeAttachmentInputs = {},
): JudgeEvidencePackage {
  const commands = fixtureResult.command_results.map((result) => ({
    command: result.command,
    ok: result.ok,
    error_code: result.error_code,
    writes: result.envelope.writes,
    warnings: result.envelope.warnings,
  }));

  const missingEvidence = [
    ...(attachments.operatorTranscript ? [] : ["real_operator_agent_transcript"]),
    ...(attachments.judgeScores ? [] : ["llm_judge_scores"]),
  ];

  return {
    schema_version: "openathor.judge_evidence.v1",
    scenario: scenario.name,
    fixture: scenario.fixture,
    user_task: scenario.user_task,
    operator_agent: {
      name: "openathor-judge-smoke",
      mode: "deterministic_fixture_runner",
      model: null,
    },
    ...(attachments.operatorTranscript
      ? { operator_transcript: attachments.operatorTranscript }
      : {}),
    deterministic_check: {
      ok: true,
      fixture_workspace: fixtureResult.workspace,
      command_count: commands.length,
      commands,
      file_changes: fixtureResult.file_changes,
      required_files: fixtureResult.required_files,
      absent_files: fixtureResult.absent_files,
      unchanged_files: fixtureResult.unchanged_files,
    },
    agent_final_response:
      attachments.agentFinalResponse?.text.trim() || scenario.expected_agent_reply,
    judge_focus: scenario.judge_focus,
    judge: {
      verdict: attachments.judgeScores?.verdict ?? "needs_review",
      blocking_failures: attachments.judgeScores?.blocking_failures ?? [],
      scores: attachments.judgeScores?.scores ??
        (Object.fromEntries(
          scoreDimensions.map((dimension) => [dimension, null]),
        ) as JudgeEvidencePackage["judge"]["scores"]),
      missing_evidence: missingEvidence,
      ...(attachments.judgeScores?.judge_model
        ? { judge_model: attachments.judgeScores.judge_model }
        : {}),
      ...(attachments.judgeScores?.notes ? { notes: attachments.judgeScores.notes } : {}),
    },
  };
}

export function validateEvidencePackage(evidencePackage: JudgeEvidencePackage): void {
  if (evidencePackage.schema_version !== "openathor.judge_evidence.v1") {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      "Judge evidence package has an unsupported schema version.",
      { exitCode: 4 },
    );
  }

  if (!evidencePackage.user_task || !evidencePackage.agent_final_response) {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      "Judge evidence package must include user task and agent final response.",
      { exitCode: 4 },
    );
  }

  if (evidencePackage.deterministic_check.command_count < 1) {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      "Judge evidence package must include CLI command evidence.",
      { exitCode: 4 },
    );
  }

  const hasWritesOrFileChanges =
    evidencePackage.deterministic_check.commands.some(
      (command) => command.writes.length > 0,
    ) || evidencePackage.deterministic_check.file_changes.length > 0;

  if (!hasWritesOrFileChanges) {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      "Judge evidence package must include writes or file change evidence.",
      { exitCode: 4 },
    );
  }
}

export async function readJudgeEvidencePackage(
  filePath: string,
): Promise<JudgeEvidencePackage> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as JudgeEvidencePackage;
}
