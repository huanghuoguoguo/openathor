#!/usr/bin/env node
import { Command } from "commander";
import { registerAssetsCommands } from "./cli/assets-commands.js";
import { registerCoreCommands } from "./cli/core-commands.js";
import { toOpenAthorError } from "./cli/emit.js";
import { errorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import { registerOutlineCommands } from "./cli/outline-commands.js";
import { registerSearchCommands } from "./cli/search-commands.js";
import { registerStyleCommands } from "./cli/style-commands.js";
import { registerUtilityCommands } from "./cli/utility-commands.js";
import { registerWritingCommands } from "./cli/writing-commands.js";

const program = new Command();

program
  .name("openathor")
  .description("OpenAthor agent-facing CLI.")
  .version("0.1.0")
  .option("--json", "emit JSON");

registerCoreCommands(program);
registerSearchCommands(program);
registerAssetsCommands(program);
registerStyleCommands(program);
registerOutlineCommands(program);
registerWritingCommands(program);
registerUtilityCommands(program);

program.exitOverride();

program.configureOutput({
  outputError: (message) => {
    if (!wantsJsonOutput()) {
      process.stderr.write(message);
    }
  },
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const openAthorError = toCliError(error);

  if (wantsJsonOutput()) {
    process.stdout.write(
      `${JSON.stringify(errorEnvelope(commandFromArgv(), openAthorError), null, 2)}\n`,
    );
  } else if (!isCommanderError(error)) {
    process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
  }

  process.exitCode = openAthorError.exitCode;
});

function wantsJsonOutput(): boolean {
  return process.argv.includes("--json");
}

function commandFromArgv(): string {
  const args = process.argv.slice(2).filter((arg) => arg !== "--json");
  return args.length > 0 ? `openathor ${args.join(" ")}` : "openathor";
}

function toCliError(error: unknown): OpenAthorError {
  if (!isCommanderError(error)) {
    return toOpenAthorError(error);
  }

  const message = error.message.replace(/^error:\s*/i, "");
  if (error.code === "commander.unknownCommand") {
    return new OpenAthorError(
      "OA_COMMAND_NOT_IMPLEMENTED",
      `${message}.`,
      {
        exitCode: error.exitCode,
        hints: ["Check docs/cli-contract/command-index.md for the delivered command surface."],
      },
    );
  }

  return new OpenAthorError(
    "OA_CLI_USAGE_ERROR",
    `${message}.`,
    { exitCode: error.exitCode },
  );
}

function isCommanderError(
  error: unknown,
): error is { code: string; message: string; exitCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code.startsWith("commander.") &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    "exitCode" in error &&
    typeof (error as { exitCode?: unknown }).exitCode === "number"
  );
}
