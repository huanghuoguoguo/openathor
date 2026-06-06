import path from "node:path";
import {
  runAdopt,
  runDoctor,
  runInit,
  runSkillInstallPi,
  type CommandResult,
} from "../protocol/kernel.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchProjectCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "init") {
    return runInit({
      targetPath: parsed.pathArg ? path.resolve(cwd, parsed.pathArg) : cwd,
      title: parsed.options.title,
      language: parsed.options.language,
      dryRun: parsed.options.dryRun,
    });
  }

  if (parsed.name === "adopt") {
    return runAdopt({
      targetPath: parsed.pathArg ? path.resolve(cwd, parsed.pathArg) : cwd,
      dryRun: parsed.options.dryRun,
      confirmAmbiguous: parsed.options.confirmAmbiguous,
    });
  }

  if (parsed.name === "doctor") {
    return runDoctor({ cwd, strict: parsed.options.strict });
  }

  if (parsed.name === "skill install pi") {
    return runSkillInstallPi({
      cwd,
      target: parsed.options.global ? "global" : "project",
      dryRun: parsed.options.dryRun,
    });
  }

  return null;
}
