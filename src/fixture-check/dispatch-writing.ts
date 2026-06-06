import {
  runWritingProposal,
  type CommandResult,
} from "../protocol/kernel.js";
import { resolveFixtureHash } from "./hash-placeholders.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchWritingCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (
    parsed.name !== "plan" &&
    parsed.name !== "draft" &&
    parsed.name !== "review" &&
    parsed.name !== "revise" &&
    parsed.name !== "canon sync"
  ) {
    return null;
  }

  return runWritingProposal({
    cwd,
    kind: parsed.name === "canon sync" ? "canon_sync" : parsed.name,
    target: parsed.pathArg,
    task: parsed.options.task,
    text: parsed.options.text,
    confirmWrite: parsed.options.confirmWrite,
    baseHash: parsed.options.baseHash
      ? await resolveFixtureHash(cwd, parsed.options.baseHash)
      : undefined,
    dryRun: parsed.options.dryRun,
    diff: parsed.options.diff,
  });
}
