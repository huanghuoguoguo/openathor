import {
  runStyleAnalyze,
  runStyleCheck,
  runStyleProfileApply,
  runStyleProfileShow,
  runStyleRevise,
  type CommandResult,
} from "../protocol/kernel.js";
import { resolveFixtureHash } from "./hash-placeholders.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchStyleCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "style profile show") {
    return runStyleProfileShow({ cwd });
  }

  if (parsed.name === "style profile apply") {
    return runStyleProfileApply({
      cwd,
      profileId: parsed.pathArg,
      diff: parsed.options.diff,
      confirm: parsed.options.confirm,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      dryRun: parsed.options.dryRun,
    });
  }

  if (parsed.name === "style analyze") {
    return runStyleAnalyze({
      cwd,
      referencePath: parsed.pathArg,
      profileId: parsed.options.profileId,
      name: parsed.options.name,
      permission: parsed.options.permission,
      sourceType: parsed.options.sourceType,
      dryRun: parsed.options.dryRun,
    });
  }

  if (parsed.name === "style check") {
    return runStyleCheck({
      cwd,
      scope: parsed.options.scope === "chapter" ? "chapter" : undefined,
      target: parsed.pathArg,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "style revise") {
    return runStyleRevise({
      cwd,
      scope: parsed.options.scope === "chapter" ? "chapter" : undefined,
      target: parsed.pathArg,
      goal: parsed.options.goal,
      text: parsed.options.text,
      confirmWrite: parsed.options.confirmWrite,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      maxChars: parsed.options.maxChars,
    });
  }

  return null;
}
