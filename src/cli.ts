#!/usr/bin/env node
import { Command } from "commander";
import { registerAssetsCommands } from "./cli/assets-commands.js";
import { registerCoreCommands } from "./cli/core-commands.js";
import { toOpenAthorError } from "./cli/emit.js";
import { registerOutlineCommands } from "./cli/outline-commands.js";
import { registerSearchCommands } from "./cli/search-commands.js";
import { registerStyleCommands } from "./cli/style-commands.js";
import { registerUtilityCommands } from "./cli/utility-commands.js";
import { registerWritingCommands } from "./cli/writing-commands.js";

const program = new Command();

program
  .name("openathor")
  .description("OpenAthor agent-facing CLI.")
  .version("0.1.0");

registerCoreCommands(program);
registerSearchCommands(program);
registerAssetsCommands(program);
registerStyleCommands(program);
registerOutlineCommands(program);
registerWritingCommands(program);
registerUtilityCommands(program);

program.configureOutput({
  outputError: (message) => process.stderr.write(message),
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const openAthorError = toOpenAthorError(error);

  process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
  process.exitCode = openAthorError.exitCode;
});
