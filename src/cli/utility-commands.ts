import type { Command } from "commander";
import { OpenAthorError } from "../protocol/errors.js";
import {
  runExport,
  runIndexRebuild,
  runSkillInstallPi,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerUtilityCommands(program: Command): void {
  program
    .command("export")
    .description("Export manuscript deliverables from plaintext sources.")
    .requiredOption("--format <format>", "export format; currently markdown")
    .option("--out <path>", "relative output path")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .action(
      async (
        options: {
          format: string;
          out?: string;
          json?: boolean;
          dryRun?: boolean;
        },
      ) => {
        await emitResult(
          "openathor export",
          options.json,
          runExport({
            format: options.format,
            out: options.out,
            dryRun: options.dryRun,
          }),
        );
      },
    );

  program
    .command("index")
    .description("Manage derived indexes.")
    .command("rebuild")
    .description("Rebuild derived indexes from plaintext sources.")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--vector", "also rebuild the optional derived vector index")
    .action(async (options: { json?: boolean; dryRun?: boolean; vector?: boolean }) => {
      await emitResult(
        "openathor index rebuild",
        options.json,
        runIndexRebuild({ dryRun: options.dryRun, vector: options.vector }),
      );
    });

  program
    .command("skill")
    .description("Manage agent skills.")
    .command("install")
    .description("Install an OpenAthor skill.")
    .argument("<agent>", "target agent")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--global", "install to the global Pi Agent skill directory")
    .action(
      async (
        agent: string,
        options: {
          json?: boolean;
          dryRun?: boolean;
          global?: boolean;
        },
      ) => {
        if (agent !== "pi") {
          await emitResult(
            "openathor skill install",
            options.json,
            Promise.reject(
              new OpenAthorError(
                "OA_SKILL_UNSUPPORTED_AGENT",
                `Unsupported skill target ${agent}.`,
                { exitCode: 2 },
              ),
            ),
          );
          return;
        }

        await emitResult(
          "openathor skill install pi",
          options.json,
          runSkillInstallPi({
            target: options.global ? "global" : "project",
            dryRun: options.dryRun,
          }),
        );
      },
    );
}
