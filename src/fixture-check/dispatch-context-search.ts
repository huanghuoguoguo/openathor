import {
  runContext,
  runSearchRelated,
  runSearchSemantic,
  runSearchText,
  type CommandResult,
} from "../protocol/kernel.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchContextSearchCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "context") {
    return runContext({
      cwd,
      scope: parsed.options.scope,
      target: parsed.pathArg,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "search text") {
    return runSearchText({
      cwd,
      query: parsed.pathArg,
      limit: parsed.options.limit,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "search related") {
    return runSearchRelated({
      cwd,
      scope: "chapter",
      target: parsed.pathArg,
      limit: parsed.options.limit,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "search semantic") {
    return runSearchSemantic({
      cwd,
      query: parsed.pathArg,
      limit: parsed.options.limit,
      maxChars: parsed.options.maxChars,
    });
  }

  return null;
}
