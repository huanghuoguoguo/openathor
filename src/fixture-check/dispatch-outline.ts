import {
  runOutlineArchive,
  runOutlineImpact,
  runOutlineInsert,
  runOutlineMerge,
  runOutlineMove,
  runOutlineReplan,
  runOutlineShow,
  runOutlineSplit,
  type CommandResult,
} from "../protocol/kernel.js";
import { resolveFixtureHash } from "./hash-placeholders.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchOutlineCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "outline show") {
    return runOutlineShow({ cwd });
  }

  if (parsed.name === "outline impact") {
    return runOutlineImpact({
      cwd,
      target: parsed.pathArg,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "outline insert") {
    return runOutlineInsert({
      cwd,
      after: parsed.options.after,
      title: parsed.options.title,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
    });
  }

  if (parsed.name === "outline move") {
    return runOutlineMove({
      cwd,
      target: parsed.pathArg,
      after: parsed.options.after,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
    });
  }

  if (parsed.name === "outline merge") {
    return runOutlineMerge({
      cwd,
      target: parsed.pathArg,
      next: parsed.secondPathArg,
      title: parsed.options.title,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      maxChars: parsed.options.maxChars,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      nextBaseHash: parsed.options.nextBaseHash
        ? await resolveFixtureHash(cwd, parsed.options.nextBaseHash)
        : undefined,
    });
  }

  if (parsed.name === "outline split") {
    return runOutlineSplit({
      cwd,
      target: parsed.pathArg,
      atLine: parsed.options.atLine,
      titleBefore: parsed.options.titleBefore,
      titleAfter: parsed.options.titleAfter,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      maxChars: parsed.options.maxChars,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
    });
  }

  if (parsed.name === "outline replan") {
    return runOutlineReplan({
      cwd,
      from: parsed.options.from,
      task: parsed.options.task,
      fromPackage: parsed.options.fromPackage,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "outline archive") {
    return runOutlineArchive({
      cwd,
      target: parsed.pathArg,
      keepFacts: parsed.options.keepFacts,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
    });
  }

  return null;
}
