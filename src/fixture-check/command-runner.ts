import path from "node:path";
import { envelope, errorEnvelope } from "../protocol/envelope.js";
import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import {
  runAdopt,
  runAssetsAudit,
  runAssetsLinkBackfill,
  runAssetsSync,
  runContext,
  runDoctor,
  runExport,
  runIndexRebuild,
  runInit,
  runOutlineArchive,
  runOutlineImpact,
  runOutlineInsert,
  runOutlineMerge,
  runOutlineMove,
  runOutlineReplan,
  runOutlineShow,
  runOutlineSplit,
  runSearchRelated,
  runSearchSemantic,
  runSearchText,
  runSkillInstallPi,
  runStyleAnalyze,
  runStyleCheck,
  runStyleProfileApply,
  runStyleProfileShow,
  runStyleRevise,
  runWritingProposal,
  type CommandResult,
} from "../protocol/kernel.js";
import { sha256File } from "../protocol/paths.js";
import { parseCommand } from "./command-parser.js";
import type {
  FixtureCommandCallResult,
  FixtureCommandEnvelopeResult,
  ParsedFixtureCommand,
} from "./types.js";

export async function executeFixtureCommand(
  command: string,
  cwd: string,
): Promise<FixtureCommandEnvelopeResult> {
  const result = await callCommand(command, cwd);

  if (!result.wasJsonEnvelope) {
    throw new OpenAthorError(
      "OA_FIXTURE_COMMAND_FAILED",
      `Command ${command} did not produce a JSON envelope.`,
      { exitCode: 4 },
    );
  }

  return {
    ok: result.ok,
    error_code: result.error_code,
    envelope: result.envelope,
  };
}

export async function callCommand(
  command: string,
  cwd: string,
): Promise<FixtureCommandCallResult> {
  const parsed = parseCommand(command);

  try {
    const result = await dispatchCommand(parsed, cwd);
    const output = envelope({
      ok: true,
      command: parsed.display,
      projectRoot: result.projectRoot,
      projectId: result.projectId,
      sources: result.sources,
      writes: result.writes,
      warnings: result.warnings,
      data: result.data,
    });
    return {
      ok: true,
      error_code: null,
      wasJsonEnvelope: isJsonEnvelope(output),
      envelope: output,
    };
  } catch (error: unknown) {
    const openAthorError =
      error instanceof OpenAthorError
        ? error
        : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
            recoverable: false,
            exitCode: 5,
          });
    const output = errorEnvelope(parsed.display, openAthorError);

    return {
      ok: false,
      error_code: openAthorError.code,
      wasJsonEnvelope: isJsonEnvelope(output),
      envelope: output,
    };
  }
}

async function dispatchCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult> {
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

  if (parsed.name === "assets audit") {
    return runAssetsAudit({
      cwd,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "assets sync") {
    return runAssetsSync({
      cwd,
      scope: parsed.options.scope === "chapter" ? "chapter" : undefined,
      target: parsed.pathArg,
      from: parsed.options.from,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      assetHashes: parsed.options.assetHashes
        ? await Promise.all(
            parsed.options.assetHashes.map((value) => resolveFixtureHash(cwd, value)),
          )
        : undefined,
    });
  }

  if (parsed.name === "assets link-backfill") {
    return runAssetsLinkBackfill({
      cwd,
      kind: parsed.pathArg,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
    });
  }

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

  if (
    parsed.name === "plan" ||
    parsed.name === "draft" ||
    parsed.name === "review" ||
    parsed.name === "revise" ||
    parsed.name === "canon sync"
  ) {
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
    });
  }

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

  if (parsed.name === "skill install pi") {
    return runSkillInstallPi({
      cwd,
      target: parsed.options.global ? "global" : "project",
      dryRun: parsed.options.dryRun,
    });
  }

  throw new OpenAthorError(
    "OA_FIXTURE_COMMAND_UNSUPPORTED",
    `Unsupported fixture command: ${parsed.display}`,
    { exitCode: 4 },
  );
}

async function resolveFixtureHash(cwd: string, value: string): Promise<string> {
  if (!value.startsWith("current:")) {
    const separator = value.indexOf("=current:");
    if (separator > 0) {
      const relPath = value.slice(separator + "=current:".length);
      return `${value.slice(0, separator)}=${await sha256File(path.join(cwd, relPath))}`;
    }

    return value;
  }

  const relPath = value.slice("current:".length);
  return sha256File(path.join(cwd, relPath));
}

function isJsonEnvelope(value: unknown): value is OpenAthorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "command" in value &&
    "protocol_version" in value &&
    "sources" in value &&
    "writes" in value &&
    "warnings" in value
  );
}
