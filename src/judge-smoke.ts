#!/usr/bin/env node
import { Command } from "commander";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envelope, errorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import { readJudgeEvidencePackage } from "./judge-smoke/evidence.js";
import { runJudgeSmoke } from "./judge-smoke/runner.js";

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
        emitJudgeSmokeError(command, error, options.json ?? false);
      }
    },
  );

if (await isDirectRun()) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    emitJudgeSmokeError("openathor-judge-smoke", error, false);
  });
}

function emitJudgeSmokeError(command: string, error: unknown, json: boolean): void {
  const openAthorError =
    error instanceof OpenAthorError
      ? error
      : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
          recoverable: false,
          exitCode: 5,
        });

  if (json) {
    process.stdout.write(
      `${JSON.stringify(errorEnvelope(command, openAthorError), null, 2)}\n`,
    );
  } else {
    process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
  }

  process.exitCode = openAthorError.exitCode;
}

async function isDirectRun(): Promise<boolean> {
  if (!process.argv[1]) {
    return false;
  }

  try {
    const [argvPath, modulePath] = await Promise.all([
      realpath(process.argv[1]),
      realpath(fileURLToPath(import.meta.url)),
    ]);

    return argvPath === modulePath;
  } catch {
    return false;
  }
}

export { readJudgeEvidencePackage, runJudgeSmoke };
