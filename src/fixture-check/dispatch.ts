import { OpenAthorError } from "../protocol/errors.js";
import type { CommandResult } from "../protocol/kernel.js";
import { dispatchAssetsCommand } from "./dispatch-assets.js";
import { dispatchContextSearchCommand } from "./dispatch-context-search.js";
import { dispatchOutlineCommand } from "./dispatch-outline.js";
import { dispatchProjectCommand } from "./dispatch-project.js";
import { dispatchStyleCommand } from "./dispatch-style.js";
import { dispatchUtilityCommand } from "./dispatch-utility.js";
import { dispatchWritingCommand } from "./dispatch-writing.js";
import type { ParsedFixtureCommand } from "./types.js";

const dispatchers = [
  dispatchProjectCommand,
  dispatchContextSearchCommand,
  dispatchAssetsCommand,
  dispatchOutlineCommand,
  dispatchWritingCommand,
  dispatchUtilityCommand,
  dispatchStyleCommand,
];

export async function dispatchCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult> {
  for (const dispatch of dispatchers) {
    const result = await dispatch(parsed, cwd);
    if (result) {
      return result;
    }
  }

  throw new OpenAthorError(
    "OA_FIXTURE_COMMAND_UNSUPPORTED",
    `Unsupported fixture command: ${parsed.display}`,
    { exitCode: 4 },
  );
}
