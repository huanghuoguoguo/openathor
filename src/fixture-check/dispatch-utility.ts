import {
  runExport,
  runIndexRebuild,
  type CommandResult,
} from "../protocol/kernel.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchUtilityCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "index rebuild") {
    return runIndexRebuild({
      cwd,
      dryRun: parsed.options.dryRun,
      vector: parsed.options.vector,
    });
  }

  if (parsed.name === "export") {
    return runExport({
      cwd,
      format: parsed.options.format,
      out: parsed.options.out,
      dryRun: parsed.options.dryRun,
    });
  }

  return null;
}
