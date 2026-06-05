#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { envelope, errorEnvelope, type OpenAthorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import { runFixtureCheck, type FixtureCheckResult } from "./fixture-check.js";

type JudgeDimension =
  | "task_success"
  | "safety"
  | "canon_consistency"
  | "context_use"
  | "change_control"
  | "user_experience"
  | "writing_fit";

type SmokeScenario = {
  name: string;
  fixture: string;
  user_task: string;
  expected_agent_reply: string;
  judge_focus: JudgeDimension[];
};

type JudgePlaceholder = {
  verdict: "needs_review" | "pass" | "fail";
  blocking_failures: string[];
  scores: Record<JudgeDimension, number | null>;
  missing_evidence: string[];
  judge_model?: string;
  notes?: string;
};

type JudgeEvidencePackage = {
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

type JudgeSmokeResult = {
  scenario_count: number;
  evidence_packages: JudgeEvidencePackage[];
  evidence_files: string[];
};

const defaultScenarios: SmokeScenario[] = [
  {
    name: "draft-confirm-write",
    fixture: "fixtures/slice-2/draft-confirm-write",
    user_task: "用户确认写入第二章草稿，并要求 OpenAthor 安全创建下一章正文。",
    expected_agent_reply:
      "已确认写入新章节，说明新增正文路径、索引状态和下一步需要运行或已运行的检查。",
    judge_focus: [
      "task_success",
      "safety",
      "context_use",
      "change_control",
      "user_experience",
      "writing_fit",
    ],
  },
  {
    name: "outline-archive",
    fixture: "fixtures/slice-3/outline-archive",
    user_task:
      "用户希望归档第一章，但要求保留正文文件和其中可能仍有价值的事实。",
    expected_agent_reply:
      "先给出影响分析，再在用户确认后归档章节元数据，并说明正文没有被删除或移动。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
    ],
  },
];

const scoreDimensions: JudgeDimension[] = [
  "task_success",
  "safety",
  "canon_consistency",
  "context_use",
  "change_control",
  "user_experience",
  "writing_fit",
];

const program = new Command();

program
  .name("openathor-judge-smoke")
  .description("Generate deterministic LLM-as-judge evidence packages.")
  .option("--json", "emit JSON")
  .option("--out-dir <path>", "write evidence packages to this directory")
  .option("--scenario <name>", "run one smoke scenario by name")
  .option(
    "--operator-transcript <path>",
    "attach a real Operator Agent transcript file to a single scenario",
  )
  .option(
    "--agent-final-response <path>",
    "attach a real Operator Agent final response file to a single scenario",
  )
  .option(
    "--judge-scores <path>",
    "attach a real LLM judge scores JSON file to a single scenario",
  )
  .action(
    async (options: {
      json?: boolean;
      outDir?: string;
      scenario?: string;
      operatorTranscript?: string;
      agentFinalResponse?: string;
      judgeScores?: string;
    }) => {
      const command = "openathor-judge-smoke";

      try {
        const result = await runJudgeSmoke({
          cwd: process.cwd(),
          outDir: options.outDir,
          scenario: options.scenario,
          operatorTranscript: options.operatorTranscript,
          agentFinalResponse: options.agentFinalResponse,
          judgeScores: options.judgeScores,
        });
        const output = envelope({
          ok: true,
          command,
          projectRoot: process.cwd(),
          writes: result.evidence_files.map((file) => ({
            path: file,
            change_type: "created",
            reason: "LLM-as-judge smoke evidence package.",
          })),
          data: result,
        });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
          process.stdout.write(
            `${command}: ${result.scenario_count} scenario(s): ok\n`,
          );
          for (const file of result.evidence_files) {
            process.stdout.write(`${file}\n`);
          }
        }
      } catch (error: unknown) {
        const openAthorError =
          error instanceof OpenAthorError
            ? error
            : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
                recoverable: false,
                exitCode: 5,
              });

        if (options.json) {
          process.stdout.write(
            `${JSON.stringify(errorEnvelope(command, openAthorError), null, 2)}\n`,
          );
        } else {
          process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
        }

        process.exitCode = openAthorError.exitCode;
      }
    },
  );

if (isDirectRun()) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    const openAthorError =
      error instanceof OpenAthorError
        ? error
        : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
            recoverable: false,
            exitCode: 5,
          });

    process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
    process.exitCode = openAthorError.exitCode;
  });
}

async function runJudgeSmoke(input: {
  cwd: string;
  outDir?: string;
  scenario?: string;
  operatorTranscript?: string;
  agentFinalResponse?: string;
  judgeScores?: string;
}): Promise<JudgeSmokeResult> {
  const scenarios = selectScenarios(input.scenario);
  const evidencePackages: JudgeEvidencePackage[] = [];
  const evidenceFiles: string[] = [];
  const outDir = input.outDir ? path.resolve(input.cwd, input.outDir) : undefined;

  if (
    (input.operatorTranscript || input.agentFinalResponse || input.judgeScores) &&
    scenarios.length !== 1
  ) {
    throw new OpenAthorError(
      "OA_JUDGE_SCENARIO_REQUIRED",
      "Attach real Operator Agent or judge evidence with --scenario <name> so it cannot be applied to the wrong package.",
      { exitCode: 2 },
    );
  }

  const operatorTranscript = input.operatorTranscript
    ? await readAttachment(input.cwd, input.operatorTranscript)
    : undefined;
  const agentFinalResponse = input.agentFinalResponse
    ? await readAttachment(input.cwd, input.agentFinalResponse)
    : undefined;
  const judgeScores = input.judgeScores
    ? await readJudgeScoresAttachment(input.cwd, input.judgeScores)
    : undefined;

  if (outDir) {
    await mkdir(outDir, { recursive: true });
  }

  for (const scenario of scenarios) {
    const fixture = path.resolve(input.cwd, scenario.fixture);
    const fixtureResult = await runFixtureCheck(fixture);
    const evidencePackage = buildEvidencePackage(scenario, fixtureResult, {
      operatorTranscript,
      agentFinalResponse,
      judgeScores,
    });

    validateEvidencePackage(evidencePackage);
    evidencePackages.push(evidencePackage);

    if (outDir) {
      const relFile = path.join(input.outDir ?? "", `${scenario.name}.json`);
      const absFile = path.resolve(input.cwd, relFile);
      await writeFile(absFile, `${JSON.stringify(evidencePackage, null, 2)}\n`);
      evidenceFiles.push(relFile);
    }
  }

  return {
    scenario_count: evidencePackages.length,
    evidence_packages: evidencePackages,
    evidence_files: evidenceFiles,
  };
}

function selectScenarios(name: string | undefined): SmokeScenario[] {
  if (!name) {
    return defaultScenarios;
  }

  const scenario = defaultScenarios.find((item) => item.name === name);

  if (!scenario) {
    throw new OpenAthorError(
      "OA_JUDGE_SCENARIO_NOT_FOUND",
      `Unknown judge smoke scenario: ${name}`,
      { exitCode: 2 },
    );
  }

  return [scenario];
}

function buildEvidencePackage(
  scenario: SmokeScenario,
  fixtureResult: FixtureCheckResult,
  attachments: {
    operatorTranscript?: { path: string; text: string };
    agentFinalResponse?: { path: string; text: string };
    judgeScores?: JudgeScoresAttachment;
  } = {},
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
        ) as Record<JudgeDimension, null>),
      missing_evidence: missingEvidence,
      ...(attachments.judgeScores?.judge_model
        ? { judge_model: attachments.judgeScores.judge_model }
        : {}),
      ...(attachments.judgeScores?.notes ? { notes: attachments.judgeScores.notes } : {}),
    },
  };
}

function validateEvidencePackage(evidencePackage: JudgeEvidencePackage): void {
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

type JudgeScoresAttachment = {
  verdict: "pass" | "fail" | "needs_review";
  blocking_failures: string[];
  scores: Record<JudgeDimension, number>;
  judge_model?: string;
  notes?: string;
};

async function readJudgeScoresAttachment(
  cwd: string,
  relOrAbsPath: string,
): Promise<JudgeScoresAttachment> {
  const absolutePath = path.resolve(cwd, relOrAbsPath);
  const text = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(text) as Partial<JudgeScoresAttachment>;

  if (
    parsed.verdict !== "pass" &&
    parsed.verdict !== "fail" &&
    parsed.verdict !== "needs_review"
  ) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include verdict: pass, fail, or needs_review.",
      { exitCode: 4 },
    );
  }

  if (!Array.isArray(parsed.blocking_failures)) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include blocking_failures as an array.",
      { exitCode: 4 },
    );
  }

  const scores = parsed.scores as Record<string, unknown> | undefined;
  if (!scores) {
    throw new OpenAthorError(
      "OA_JUDGE_SCORES_INVALID",
      "Judge scores must include all rubric score dimensions.",
      { exitCode: 4 },
    );
  }

  for (const dimension of scoreDimensions) {
    const score = scores[dimension];
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5
    ) {
      throw new OpenAthorError(
        "OA_JUDGE_SCORES_INVALID",
        `Judge score ${dimension} must be an integer from 1 to 5.`,
        { exitCode: 4 },
      );
    }
  }

  return {
    verdict: parsed.verdict,
    blocking_failures: parsed.blocking_failures,
    scores: Object.fromEntries(
      scoreDimensions.map((dimension) => [dimension, scores[dimension] as number]),
    ) as Record<JudgeDimension, number>,
    judge_model: parsed.judge_model,
    notes: parsed.notes,
  };
}

function isDirectRun(): boolean {
  return Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
  );
}

export async function readJudgeEvidencePackage(
  filePath: string,
): Promise<JudgeEvidencePackage> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as JudgeEvidencePackage;
}

async function readAttachment(
  cwd: string,
  relOrAbsPath: string,
): Promise<{ path: string; text: string }> {
  const absolutePath = path.resolve(cwd, relOrAbsPath);
  const text = await readFile(absolutePath, "utf8");

  if (!text.trim()) {
    throw new OpenAthorError(
      "OA_JUDGE_EVIDENCE_INVALID",
      `Evidence attachment is empty: ${relOrAbsPath}`,
      { exitCode: 4 },
    );
  }

  return {
    path: relOrAbsPath,
    text,
  };
}
