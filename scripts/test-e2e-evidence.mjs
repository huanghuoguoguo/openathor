#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runJudgeSmoke } from "../dist/judge-smoke.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(projectRoot, "evals/manual/e2e-evidence-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = manifest.manual_e2e_evidence;

if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error("manual_e2e_evidence manifest must contain at least one scenario.");
}

for (const entry of entries) {
  assertString(entry.scenario, "scenario");
  assertString(entry.operator_transcript, "operator_transcript");
  assertString(entry.agent_final_response, "agent_final_response");
  assertString(entry.judge_scores, "judge_scores");

  const finalResponse = (await readFile(path.join(projectRoot, entry.agent_final_response), "utf8")).trim();
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
  if (evidence.scenario !== entry.scenario) {
    throw new Error(`${entry.scenario} produced evidence for ${evidence.scenario}.`);
  }

  if (!evidence.operator_transcript?.text.includes(`Scenario: \`${entry.scenario}\``)) {
    throw new Error(`${entry.scenario} transcript does not declare the matching scenario.`);
  }

  if (evidence.agent_final_response !== finalResponse) {
    throw new Error(`${entry.scenario} final response attachment was not used.`);
  }

  if (evidence.judge.verdict !== "pass") {
    throw new Error(`${entry.scenario} expected pass verdict, got ${evidence.judge.verdict}.`);
  }

  if (evidence.judge.blocking_failures.length > 0) {
    throw new Error(`${entry.scenario} has blocking failures: ${evidence.judge.blocking_failures.join(", ")}`);
  }

  if (evidence.judge.missing_evidence.length > 0) {
    throw new Error(`${entry.scenario} still has missing evidence: ${evidence.judge.missing_evidence.join(", ")}`);
  }

  if (evidence.deterministic_check.command_count < 1 || evidence.deterministic_check.file_changes.length < 1) {
    throw new Error(`${entry.scenario} deterministic replay did not produce command and file-change evidence.`);
  }

  assertIncludedCommands(entry, evidence);
  assertIncludedFiles(entry, evidence);
  assertExpectedFailedCommands(entry, evidence);
  assertScores(entry, evidence);
}

process.stdout.write(`openathor-e2e-evidence: ${entries.length} scenario(s): ok\n`);

function assertIncludedCommands(entry, evidence) {
  for (const command of entry.must_include_commands ?? []) {
    if (!evidence.deterministic_check.commands.some((actual) => actual.command === command)) {
      throw new Error(`${entry.scenario} missing command evidence: ${command}`);
    }
  }
}

function assertIncludedFiles(entry, evidence) {
  for (const filePath of entry.must_include_files ?? []) {
    const changed = evidence.deterministic_check.file_changes.some((change) => change.path === filePath);
    const required = evidence.deterministic_check.required_files.includes(filePath);
    if (!changed && !required) {
      throw new Error(`${entry.scenario} missing file evidence: ${filePath}`);
    }
  }
}

function assertExpectedFailedCommands(entry, evidence) {
  const expectedCodes = entry.expected_failed_error_codes ?? [];
  const actualFailed = evidence.deterministic_check.commands.filter((command) => !command.ok);
  const actualCodes = actualFailed.map((command) => command.error_code);

  if (actualFailed.length !== expectedCodes.length) {
    throw new Error(
      `${entry.scenario} expected ${expectedCodes.length} failed command(s), got ${actualFailed.length}.`,
    );
  }

  for (const code of expectedCodes) {
    if (!actualCodes.includes(code)) {
      throw new Error(`${entry.scenario} missing expected failed command error: ${code}`);
    }
  }

  for (const code of actualCodes) {
    if (!expectedCodes.includes(code)) {
      throw new Error(`${entry.scenario} had unexpected failed command error: ${String(code)}`);
    }
  }

  for (const failed of actualFailed) {
    if (failed.writes.length > 0) {
      throw new Error(`${entry.scenario} failed command reported writes: ${failed.command}`);
    }
  }
}

function assertScores(entry, evidence) {
  for (const [dimension, score] of Object.entries(evidence.judge.scores)) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error(`${entry.scenario} invalid score ${dimension}: ${String(score)}`);
    }
  }
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`manual_e2e_evidence entry missing ${field}.`);
  }
}
