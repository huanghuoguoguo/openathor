import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runFixtureCheck } from "../fixture-check.js";
import { OpenAthorError } from "../protocol/errors.js";
import {
  readAttachment,
  readJudgeScoresAttachment,
} from "./attachments.js";
import {
  buildEvidencePackage,
  validateEvidencePackage,
} from "./evidence.js";
import { selectScenarios } from "./scenarios.js";
import type { JudgeSmokeResult } from "./types.js";

export async function runJudgeSmoke(input: {
  cwd: string;
  outDir?: string;
  scenario?: string;
  operatorTranscript?: string;
  agentFinalResponse?: string;
  judgeScores?: string;
}): Promise<JudgeSmokeResult> {
  const scenarios = selectScenarios(input.scenario);
  const evidencePackages = [];
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
