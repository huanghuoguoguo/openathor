#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runJudgeSmoke } from "../dist/judge-smoke.js";

const scoreDimensions = [
  "task_success",
  "safety",
  "canon_consistency",
  "context_use",
  "change_control",
  "user_experience",
  "writing_fit",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const options = parseArgs(process.argv.slice(2));
const manifestPath = path.join(projectRoot, "evals/manual/e2e-evidence-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = manifest.manual_e2e_evidence;

if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error("manual_e2e_evidence manifest must contain at least one scenario.");
}

const scenarios = [];

for (const entry of entries) {
  assertString(entry.scenario, "scenario");
  assertString(entry.operator_transcript, "operator_transcript");
  assertString(entry.agent_final_response, "agent_final_response");
  assertString(entry.judge_scores, "judge_scores");

  const result = await runJudgeSmoke({
    cwd: projectRoot,
    scenario: entry.scenario,
    operatorTranscript: entry.operator_transcript,
    agentFinalResponse: entry.agent_final_response,
    judgeScores: entry.judge_scores,
  });

  if (result.scenario_count !== 1 || result.evidence_packages.length !== 1) {
    throw new Error(`${entry.scenario} expected exactly one evidence package.`);
  }

  const evidence = result.evidence_packages[0];
  const failedCommands = evidence.deterministic_check.commands.filter((command) => !command.ok);
  const scores = evidence.judge.scores;

  scenarios.push({
    scenario: evidence.scenario,
    fixture: evidence.fixture,
    verdict: evidence.judge.verdict,
    judge_model: evidence.judge.judge_model,
    score_average: average(Object.values(scores)),
    scores,
    blocking_failures: evidence.judge.blocking_failures,
    missing_evidence: evidence.judge.missing_evidence,
    deterministic: {
      command_count: evidence.deterministic_check.command_count,
      failed_command_count: failedCommands.length,
      expected_failed_error_codes: entry.expected_failed_error_codes ?? [],
      file_change_count: evidence.deterministic_check.file_changes.length,
      required_file_count: evidence.deterministic_check.required_files.length,
      absent_file_count: evidence.deterministic_check.absent_files.length,
    },
    manifest_coverage: {
      must_include_command_count: (entry.must_include_commands ?? []).length,
      must_include_file_count: (entry.must_include_files ?? []).length,
    },
  });
}

const report = {
  schema: "openathor.rc_eval_report.v1",
  generated_at: new Date().toISOString(),
  git_commit: gitCommit(),
  manifest: "evals/manual/e2e-evidence-manifest.json",
  scenario_count: scenarios.length,
  pass_count: scenarios.filter((scenario) => scenario.verdict === "pass").length,
  blocking_failure_count: scenarios.reduce(
    (sum, scenario) => sum + scenario.blocking_failures.length,
    0,
  ),
  missing_evidence_count: scenarios.reduce(
    (sum, scenario) => sum + scenario.missing_evidence.length,
    0,
  ),
  score_averages: Object.fromEntries(
    scoreDimensions.map((dimension) => [
      dimension,
      average(scenarios.map((scenario) => scenario.scores[dimension])),
    ]),
  ),
  scenarios,
};

if (options.outDir) {
  const outDir = path.resolve(projectRoot, options.outDir);
  await mkdir(outDir, { recursive: true });
  const safeTimestamp = report.generated_at.replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `${safeTimestamp}-rc-eval.json`);
  await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);
  report.output_file = path.relative(projectRoot, outFile);
}

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    `openathor-rc-eval: ${report.pass_count}/${report.scenario_count} scenario(s) pass`,
  );
  process.stdout.write(
    `, blocking_failures=${report.blocking_failure_count}, missing_evidence=${report.missing_evidence_count}\n`,
  );

  for (const scenario of scenarios) {
    process.stdout.write(
      `- ${scenario.scenario}: verdict=${scenario.verdict}, avg=${scenario.score_average}, commands=${scenario.deterministic.command_count}, files=${scenario.deterministic.file_change_count}\n`,
    );
  }

  if (report.output_file) {
    process.stdout.write(`${report.output_file}\n`);
  }
}

if (
  report.pass_count !== report.scenario_count ||
  report.blocking_failure_count > 0 ||
  report.missing_evidence_count > 0
) {
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {
    json: false,
    outDir: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--out-dir") {
      parsed.outDir = args[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function average(values) {
  const numeric = values.filter((value) => typeof value === "number");
  if (numeric.length === 0) {
    return null;
  }

  return Number(
    (numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2),
  );
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`manual_e2e_evidence entry missing ${field}.`);
  }
}
