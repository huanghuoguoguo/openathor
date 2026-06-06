import { parseCommandArguments } from "./command-options.js";
import { matchFixtureCommandRoute } from "./command-routes.js";
import { tokenizeFixtureCommand } from "./command-tokenizer.js";
import type { ParsedFixtureCommand } from "./types.js";

export function parseCommand(command: string): ParsedFixtureCommand {
  const tokens = tokenizeFixtureCommand(command);
  const { options, positional } = parseCommandArguments(tokens);

  return matchFixtureCommandRoute(command, positional, options);
}
