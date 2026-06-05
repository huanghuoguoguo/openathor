import type { Command } from "commander";
import { OpenAthorError } from "../protocol/errors.js";
import {
  runAdopt,
  runContext,
  runDoctor,
  runInit,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerCoreCommands(program: Command): void {
  program
    .command("init")
    .description("Create an OpenAthor project skeleton.")
    .argument("[path]", "target directory")
    .option("--title <title>", "project title")
    .option("--language <tag>", "project language", "zh-CN")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .action(
      async (
        targetPath: string | undefined,
        options: {
          title?: string;
          language?: string;
          json?: boolean;
          dryRun?: boolean;
        },
      ) => {
        await emitResult(
          "openathor init",
          options.json,
          runInit({
            targetPath,
            title: options.title,
            language: options.language,
            dryRun: options.dryRun,
          }),
        );
      },
    );

  program
    .command("adopt")
    .description("Adopt an existing manuscript directory without rewriting user files.")
    .argument("[path]", "target directory")
    .option("--json", "emit JSON")
    .option("--dry-run", "scan and plan without writing files")
    .option("--confirm-ambiguous", "write import questions even when order is ambiguous")
    .action(
      async (
        targetPath: string | undefined,
        options: {
          json?: boolean;
          dryRun?: boolean;
          confirmAmbiguous?: boolean;
        },
      ) => {
        await emitResult(
          "openathor adopt",
          options.json,
          runAdopt({
            targetPath,
            dryRun: options.dryRun,
            confirmAmbiguous: options.confirmAmbiguous,
          }),
        );
      },
    );

  program
    .command("doctor")
    .description("Check an OpenAthor project.")
    .option("--json", "emit JSON")
    .option("--strict", "treat warnings as errors")
    .action(async (options: { json?: boolean; strict?: boolean }) => {
      await emitResult(
        "openathor doctor",
        options.json,
        runDoctor({ strict: options.strict }),
      );
    });

  program
    .command("context")
    .description("Build a read-only context pack for an OpenAthor project.")
    .argument("[scope]", "context scope: project or chapter", "project")
    .argument("[target]", "chapter id or display order for chapter scope")
    .option("--json", "emit JSON")
    .option("--max-chars <count>", "maximum characters for the target chapter")
    .action(
      async (
        scope: string,
        target: string | undefined,
        options: { json?: boolean; maxChars?: string },
      ) => {
        if (scope !== "project" && scope !== "chapter") {
          await emitResult(
            "openathor context",
            options.json,
            Promise.reject(
              new OpenAthorError(
                "OA_CONTEXT_UNSUPPORTED_SCOPE",
                `Unsupported context scope ${scope}.`,
                { exitCode: 2 },
              ),
            ),
          );
          return;
        }

        await emitResult(
          scope === "chapter" ? "openathor context chapter" : "openathor context",
          options.json,
          runContext({
            scope,
            target,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
          }),
        );
      },
    );
}
