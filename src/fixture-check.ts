#!/usr/bin/env node
import { Command } from "commander";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { envelope, errorEnvelope } from "./protocol/envelope.js";
import type { OpenAthorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import {
  runAdopt,
  runAssetsAudit,
  runContext,
  runDoctor,
  runExport,
  runIndexRebuild,
  runInit,
  runNotImplemented,
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
  runStyleCheck,
  runStyleProfileShow,
  runWritingProposal,
  type CommandResult,
} from "./protocol/kernel.js";
import { sha256File, toPosix } from "./protocol/paths.js";

const program = new Command();

type ExpectedCommand = {
  run: string;
  ok?: boolean;
  error_code?: string;
  expect_data_path?: string;
  expect_data?: Record<string, unknown>;
  expect_no_writes?: boolean;
};

type ExpectedCommands = {
  commands: ExpectedCommand[];
};

type ExpectedFiles = {
  required?: string[];
  absent?: string[];
};

type ExpectedDisallowed = {
  unchanged?: string[];
  absent?: string[];
};

type ExpectedDoctor = {
  ok: boolean;
  checks?: Record<string, boolean>;
};

export type FixtureCommandResult = {
  command: string;
  ok: boolean;
  error_code: string | null;
  envelope: OpenAthorEnvelope;
};

export type FixtureFileChange = {
  path: string;
  change_type: "created" | "modified" | "deleted";
  before_hash: string | null;
  after_hash: string | null;
  before_excerpt?: string;
  after_excerpt?: string;
};

export type FixtureCheckResult = {
  fixture: string;
  workspace: string;
  command_results: FixtureCommandResult[];
  required_files: string[];
  absent_files: string[];
  unchanged_files: string[];
  file_changes: FixtureFileChange[];
};

program
  .name("openathor-fixture-check")
  .description("Run deterministic OpenAthor fixture checks.")
  .argument("[fixture]", "fixture directory")
  .option("--json", "emit JSON")
  .action(async (fixture: string | undefined, options: { json?: boolean }) => {
    const command = "openathor-fixture-check";

    try {
      if (!fixture) {
        throw new OpenAthorError(
          "OA_FIXTURE_NOT_FOUND",
          "Provide a Slice 1 fixture directory.",
          { exitCode: 2 },
        );
      }

      const result = await runFixtureCheck(path.resolve(fixture));
      const output = envelope({
        ok: true,
        command,
        projectRoot: result.workspace,
        writes: [],
        data: result,
      });

      if (options.json) {
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } else {
        process.stdout.write(`${command}: ${fixture}: ok\n`);
      }
    } catch (error: unknown) {
      const openAthorError =
        error instanceof OpenAthorError
          ? error
          : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
              recoverable: false,
              exitCode: 5,
            });

      if (options.json) {
        process.stdout.write(
          `${JSON.stringify(errorEnvelope(command, openAthorError), null, 2)}\n`,
        );
      } else {
        process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
      }

      process.exitCode = openAthorError.exitCode;
    }
  });

if (isDirectRun()) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    const openAthorError =
      error instanceof OpenAthorError
        ? error
        : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
            recoverable: false,
            exitCode: 5,
          });

    process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
    process.exitCode = openAthorError.exitCode;
  });
}

export async function runFixtureCheck(
  fixtureDir: string,
): Promise<FixtureCheckResult> {
  const inputDir = path.join(fixtureDir, "input");
  const expectedDir = path.join(fixtureDir, "expected");

  if (!(await isDirectory(inputDir)) || !(await isDirectory(expectedDir))) {
    throw new OpenAthorError(
      "OA_FIXTURE_INVALID",
      "Fixture must contain input/ and expected/ directories.",
      { exitCode: 2 },
    );
  }

  const workspace = await mkdtemp(path.join(os.tmpdir(), "openathor-fixture-"));
  await cp(inputDir, workspace, { recursive: true });
  await removeGitkeepFiles(workspace);

  const beforeHashes = await hashExistingFiles(workspace);
  const beforeExcerpts = await textExcerptsForHashes(workspace, beforeHashes);
  const expectedCommands = await readExpectedYaml<ExpectedCommands>(
    expectedDir,
    "commands.yaml",
  );
  const expectedFiles = await readExpectedYaml<ExpectedFiles>(expectedDir, "files.yaml");
  const expectedDisallowed = await readExpectedYaml<ExpectedDisallowed>(
    expectedDir,
    "disallowed.yaml",
  );
  const expectedDoctor = await readExpectedJson<ExpectedDoctor>(
    expectedDir,
    "doctor.json",
  );
  const commandResults: FixtureCommandResult[] = [];

  try {
    for (const expectedCommand of expectedCommands.commands ?? []) {
      const result = await executeFixtureCommand(expectedCommand.run, workspace);
      const expectedOk = expectedCommand.ok ?? true;

      if (result.ok !== expectedOk) {
        throw new OpenAthorError(
          "OA_FIXTURE_COMMAND_FAILED",
          `Command ${expectedCommand.run} ok=${result.ok}, expected ok=${expectedOk}.`,
          { exitCode: 4 },
        );
      }

      if (
        expectedCommand.error_code &&
        result.error_code !== expectedCommand.error_code
      ) {
        throw new OpenAthorError(
          "OA_FIXTURE_COMMAND_FAILED",
          `Command ${expectedCommand.run} error ${result.error_code}, expected ${expectedCommand.error_code}.`,
          { exitCode: 4 },
        );
      }

      if (
        expectedCommand.expect_data_path &&
        !hasDataPath(result.envelope.data, expectedCommand.expect_data_path)
      ) {
        throw new OpenAthorError(
          "OA_FIXTURE_COMMAND_FAILED",
          `Command ${expectedCommand.run} missing data path ${expectedCommand.expect_data_path}.`,
          { exitCode: 4 },
        );
      }

      for (const [dataPath, expectedValue] of Object.entries(
        expectedCommand.expect_data ?? {},
      )) {
        const actualValue = getDataPath(result.envelope.data, dataPath);
        if (actualValue !== expectedValue) {
          throw new OpenAthorError(
            "OA_FIXTURE_COMMAND_FAILED",
            `Command ${expectedCommand.run} data path ${dataPath}=${JSON.stringify(actualValue)}, expected ${JSON.stringify(expectedValue)}.`,
            { exitCode: 4 },
          );
        }
      }

      if (expectedCommand.expect_no_writes && result.envelope.writes.length > 0) {
        throw new OpenAthorError(
          "OA_FIXTURE_COMMAND_FAILED",
          `Command ${expectedCommand.run} reported writes, expected none.`,
          { exitCode: 4 },
        );
      }

      commandResults.push({
        command: expectedCommand.run,
        ok: result.ok,
        error_code: result.error_code,
        envelope: result.envelope,
      });
    }

    await checkRequiredFiles(workspace, expectedFiles.required ?? []);
    await checkAbsentFiles(workspace, [
      ...(expectedFiles.absent ?? []),
      ...(expectedDisallowed.absent ?? []),
    ]);
    await checkUnchangedFiles(workspace, beforeHashes, expectedDisallowed.unchanged ?? []);

    if (await pathExists(path.join(workspace, "openathor.yaml"))) {
      const doctorResult = await callCommand("openathor doctor --json --strict", workspace);
      if (!doctorResult.ok) {
        throw new OpenAthorError(
          "OA_FIXTURE_DOCTOR_FAILED",
          `Final doctor --strict failed with ${doctorResult.error_code}.`,
          { exitCode: 4 },
        );
      }

      checkDoctorExpectation(doctorResult.envelope, expectedDoctor);

      commandResults.push({
        command: "openathor doctor --json --strict",
        ok: true,
        error_code: null,
        envelope: doctorResult.envelope,
      });
    }

    const fileChanges = await collectFileChanges(
      workspace,
      beforeHashes,
      beforeExcerpts,
    );

    return {
      fixture: fixtureDir,
      workspace,
      command_results: commandResults,
      required_files: expectedFiles.required ?? [],
      absent_files: [...(expectedFiles.absent ?? []), ...(expectedDisallowed.absent ?? [])],
      unchanged_files: expectedDisallowed.unchanged ?? [],
      file_changes: fileChanges,
    };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

function isDirectRun(): boolean {
  return Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
  );
}

async function executeFixtureCommand(
  command: string,
  cwd: string,
): Promise<{
  ok: boolean;
  error_code: string | null;
  envelope: OpenAthorEnvelope;
}> {
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

async function callCommand(
  command: string,
  cwd: string,
): Promise<{
  ok: boolean;
  error_code: string | null;
  wasJsonEnvelope: boolean;
  envelope: OpenAthorEnvelope;
}> {
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
  parsed: ReturnType<typeof parseCommand>,
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
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
      maxChars: parsed.options.maxChars,
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
      dryRun: parsed.options.dryRun,
      diff: parsed.options.diff,
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

  if (parsed.name === "style check") {
    return runStyleCheck({
      cwd,
      scope: parsed.options.scope === "chapter" ? "chapter" : undefined,
      target: parsed.pathArg,
      maxChars: parsed.options.maxChars,
    });
  }

  if (
    parsed.name === "style analyze" ||
    parsed.name === "style revise" ||
    parsed.name === "style profile apply"
  ) {
    return runNotImplemented({
      command: `openathor ${parsed.name}`,
      feature: "Style guidance CLI",
      hints: ["Style commands are intentionally structured as not implemented until the style slice is built."],
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

function parseCommand(command: string): {
  display: string;
  name:
    | "init"
    | "adopt"
    | "doctor"
    | "context"
    | "search text"
    | "search related"
    | "search semantic"
    | "assets audit"
    | "outline show"
    | "outline impact"
    | "outline insert"
    | "outline move"
    | "outline merge"
    | "outline split"
    | "outline replan"
    | "outline archive"
    | "plan"
    | "draft"
    | "review"
    | "revise"
    | "canon sync"
    | "export"
    | "style analyze"
    | "style check"
    | "style revise"
    | "style profile show"
    | "style profile apply"
    | "index rebuild"
    | "skill install pi";
  pathArg?: string;
  secondPathArg?: string;
  options: {
    title?: string;
    language?: string;
    dryRun?: boolean;
    strict?: boolean;
    confirmAmbiguous?: boolean;
    global?: boolean;
    confirm?: boolean;
    diff?: boolean;
    keepFacts?: boolean;
    scope?: "project" | "chapter";
    maxChars?: number;
    limit?: number;
    task?: string;
    text?: string;
    confirmWrite?: boolean;
    baseHash?: string;
    after?: string;
    atLine?: number;
    titleBefore?: string;
    titleAfter?: string;
    from?: string;
    vector?: boolean;
    format?: string;
    out?: string;
  };
} {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) =>
    token.replace(/^["']|["']$/g, ""),
  );

  if (!tokens || tokens[0] !== "openathor") {
    throw new OpenAthorError(
      "OA_FIXTURE_COMMAND_UNSUPPORTED",
      `Fixture command must start with openathor: ${command}`,
      { exitCode: 4 },
    );
  }

  const options: ReturnType<typeof parseCommand>["options"] = {};
  const positional: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "--json") {
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--strict") {
      options.strict = true;
      continue;
    }

    if (token === "--confirm-ambiguous") {
      options.confirmAmbiguous = true;
      continue;
    }

    if (token === "--global") {
      options.global = true;
      continue;
    }

    if (token === "--confirm") {
      options.confirm = true;
      continue;
    }

    if (token === "--diff") {
      options.diff = true;
      continue;
    }

    if (token === "--keep-facts") {
      options.keepFacts = true;
      continue;
    }

    if (token === "--vector") {
      options.vector = true;
      continue;
    }

    if (token === "--format") {
      index += 1;
      options.format = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--out") {
      index += 1;
      options.out = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--title") {
      index += 1;
      options.title = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--language") {
      index += 1;
      options.language = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--max-chars") {
      index += 1;
      options.maxChars = Number(tokens[index]);
      continue;
    }

    if (token === "--limit") {
      index += 1;
      options.limit = Number(tokens[index]);
      continue;
    }

    if (token === "--task") {
      index += 1;
      options.task = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--text") {
      index += 1;
      options.text = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--confirm-write") {
      options.confirmWrite = true;
      continue;
    }

    if (token === "--base-hash") {
      index += 1;
      options.baseHash = tokens[index];
      continue;
    }

    if (token === "--after") {
      index += 1;
      options.after = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--from") {
      index += 1;
      options.from = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--at-line") {
      index += 1;
      options.atLine = Number(tokens[index]);
      continue;
    }

    if (token === "--title-before") {
      index += 1;
      options.titleBefore = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--title-after") {
      index += 1;
      options.titleAfter = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    positional.push(unescapeFixtureArgument(token));
  }

  if (positional[0] === "index" && positional[1] === "rebuild") {
    return {
      display: "openathor index rebuild",
      name: "index rebuild",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "export") {
    return {
      display: "openathor export",
      name: "export",
      options,
    };
  }

  if (positional[0] === "style" && positional[1] === "analyze") {
    return {
      display: "openathor style analyze",
      name: "style analyze",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "style" && positional[1] === "check") {
    const scope = positional[2] === "chapter" ? "chapter" : undefined;
    options.scope = scope;

    return {
      display: "openathor style check",
      name: "style check",
      pathArg: positional[3],
      options,
    };
  }

  if (positional[0] === "style" && positional[1] === "revise") {
    return {
      display: "openathor style revise",
      name: "style revise",
      pathArg: positional[3],
      options,
    };
  }

  if (positional[0] === "style" && positional[1] === "profile" && positional[2] === "show") {
    return {
      display: "openathor style profile show",
      name: "style profile show",
      options,
    };
  }

  if (positional[0] === "style" && positional[1] === "profile" && positional[2] === "apply") {
    return {
      display: "openathor style profile apply",
      name: "style profile apply",
      pathArg: positional[3],
      options,
    };
  }

  if (
    positional[0] === "skill" &&
    positional[1] === "install" &&
    positional[2] === "pi"
  ) {
    return {
      display: "openathor skill install pi",
      name: "skill install pi",
      options,
    };
  }

  if (
    positional[0] === "init" ||
    positional[0] === "adopt" ||
    positional[0] === "doctor"
  ) {
    return {
      display: `openathor ${positional[0]}`,
      name: positional[0],
      pathArg: positional[1],
      options,
    };
  }

  if (positional[0] === "context") {
    const scope = positional[1] === "chapter" ? "chapter" : "project";
    options.scope = scope;

    return {
      display: scope === "chapter" ? "openathor context chapter" : "openathor context",
      name: "context",
      pathArg: scope === "chapter" ? positional[2] : undefined,
      options,
    };
  }

  if (positional[0] === "search" && positional[1] === "text") {
    return {
      display: "openathor search text",
      name: "search text",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "search" && positional[1] === "related") {
    const scope = positional[2] === "chapter" ? "chapter" : undefined;
    options.scope = scope;

    return {
      display: "openathor search related",
      name: "search related",
      pathArg: positional[3],
      options,
    };
  }

  if (positional[0] === "search" && positional[1] === "semantic") {
    return {
      display: "openathor search semantic",
      name: "search semantic",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "assets" && positional[1] === "audit") {
    return {
      display: "openathor assets audit",
      name: "assets audit",
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "show") {
    return {
      display: "openathor outline show",
      name: "outline show",
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "impact") {
    return {
      display: "openathor outline impact",
      name: "outline impact",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "insert") {
    return {
      display: "openathor outline insert",
      name: "outline insert",
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "move") {
    return {
      display: "openathor outline move",
      name: "outline move",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "merge") {
    return {
      display: "openathor outline merge",
      name: "outline merge",
      pathArg: positional[2],
      secondPathArg: positional[3],
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "split") {
    return {
      display: "openathor outline split",
      name: "outline split",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "replan") {
    return {
      display: "openathor outline replan",
      name: "outline replan",
      options,
    };
  }

  if (positional[0] === "outline" && positional[1] === "archive") {
    return {
      display: "openathor outline archive",
      name: "outline archive",
      pathArg: positional[2],
      options,
    };
  }

  if (positional[0] === "plan") {
    return {
      display: "openathor plan",
      name: "plan",
      pathArg: positional[1],
      options,
    };
  }

  if (
    positional[0] === "draft" ||
    positional[0] === "review" ||
    positional[0] === "revise"
  ) {
    return {
      display: `openathor ${positional[0]}`,
      name: positional[0],
      pathArg: positional[1] === "chapter" ? positional[2] : positional[1],
      options,
    };
  }

  if (positional[0] === "canon" && positional[1] === "sync") {
    return {
      display: "openathor canon sync",
      name: "canon sync",
      pathArg: positional[2],
      options,
    };
  }

  throw new OpenAthorError(
    "OA_FIXTURE_COMMAND_UNSUPPORTED",
    `Unsupported fixture command: ${command}`,
    { exitCode: 4 },
  );
}

function unescapeFixtureArgument(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

async function resolveFixtureHash(cwd: string, value: string): Promise<string> {
  if (!value.startsWith("current:")) {
    return value;
  }

  const relPath = value.slice("current:".length);
  return sha256File(path.join(cwd, relPath));
}

async function removeGitkeepFiles(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await removeGitkeepFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name === ".gitkeep") {
      await rm(fullPath, { force: true });
    }
  }
}

function isJsonEnvelope(value: unknown): boolean {
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

function hasDataPath(data: unknown, dataPath: string): boolean {
  return getDataPath(data, dataPath) !== undefined && getDataPath(data, dataPath) !== null;
}

function getDataPath(data: unknown, dataPath: string): unknown {
  let current: unknown = data;

  for (const segment of dataPath.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

async function readExpectedYaml<T>(dir: string, filename: string): Promise<T> {
  const filePath = path.join(dir, filename);
  const text = await readFile(filePath, "utf8");
  return parseYaml(text) as T;
}

async function readExpectedJson<T>(dir: string, filename: string): Promise<T> {
  const filePath = path.join(dir, filename);
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

function checkDoctorExpectation(
  actual: OpenAthorEnvelope,
  expected: ExpectedDoctor,
): void {
  if (actual.ok !== expected.ok) {
    throw new OpenAthorError(
      "OA_FIXTURE_DOCTOR_FAILED",
      `Final doctor ok=${actual.ok}, expected ok=${expected.ok}.`,
      { exitCode: 4 },
    );
  }

  const checks =
    typeof actual.data === "object" &&
    actual.data !== null &&
    "checks" in actual.data &&
    typeof actual.data.checks === "object" &&
    actual.data.checks !== null
      ? (actual.data.checks as Record<string, unknown>)
      : {};

  for (const [key, expectedValue] of Object.entries(expected.checks ?? {})) {
    if (checks[key] !== expectedValue) {
      throw new OpenAthorError(
        "OA_FIXTURE_DOCTOR_FAILED",
        `Final doctor check ${key}=${String(checks[key])}, expected ${expectedValue}.`,
        { exitCode: 4 },
      );
    }
  }
}

async function checkRequiredFiles(root: string, files: string[]): Promise<void> {
  for (const relPath of files) {
    if (!(await pathExists(path.join(root, relPath)))) {
      throw new OpenAthorError(
        "OA_FIXTURE_EXPECTED_FILE_MISSING",
        `Expected file is missing: ${relPath}`,
        { exitCode: 4 },
      );
    }
  }
}

async function checkAbsentFiles(root: string, files: string[]): Promise<void> {
  for (const relPath of files) {
    if (await pathExists(path.join(root, relPath))) {
      throw new OpenAthorError(
        "OA_FIXTURE_DISALLOWED_FILE_PRESENT",
        `Disallowed file exists: ${relPath}`,
        { exitCode: 4 },
      );
    }
  }
}

async function checkUnchangedFiles(
  root: string,
  beforeHashes: Map<string, string>,
  files: string[],
): Promise<void> {
  for (const relPath of files) {
    const before = beforeHashes.get(relPath);
    const fullPath = path.join(root, relPath);

    if (!before || !(await pathExists(fullPath))) {
      throw new OpenAthorError(
        "OA_FIXTURE_DISALLOWED_WRITE",
        `Cannot prove file stayed unchanged: ${relPath}`,
        { exitCode: 4 },
      );
    }

    const after = await sha256File(fullPath);
    if (after !== before) {
      throw new OpenAthorError(
        "OA_FIXTURE_DISALLOWED_WRITE",
        `Fixture command modified protected file: ${relPath}`,
        { exitCode: 4 },
      );
    }
  }
}

async function hashExistingFiles(root: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = toPosix(path.relative(root, fullPath));
      hashes.set(relPath, await sha256File(fullPath));
    }
  }

  await visit(root);
  return hashes;
}

async function collectFileChanges(
  root: string,
  beforeHashes: Map<string, string>,
  beforeExcerpts: Map<string, string>,
): Promise<FixtureFileChange[]> {
  const afterHashes = await hashExistingFiles(root);
  const allPaths = new Set([...beforeHashes.keys(), ...afterHashes.keys()]);
  const changes: FixtureFileChange[] = [];

  for (const relPath of [...allPaths].sort()) {
    const beforeHash = beforeHashes.get(relPath) ?? null;
    const afterHash = afterHashes.get(relPath) ?? null;

    if (beforeHash === afterHash) {
      continue;
    }

    const changeType =
      beforeHash === null ? "created" : afterHash === null ? "deleted" : "modified";
    const beforeExcerpt = beforeExcerpts.get(relPath);
    const afterExcerpt =
      afterHash === null ? undefined : await readTextExcerpt(path.join(root, relPath));

    changes.push({
      path: relPath,
      change_type: changeType,
      before_hash: beforeHash,
      after_hash: afterHash,
      ...(beforeExcerpt ? { before_excerpt: beforeExcerpt } : {}),
      ...(afterExcerpt ? { after_excerpt: afterExcerpt } : {}),
    });
  }

  return changes;
}

async function textExcerptsForHashes(
  root: string,
  hashes: Map<string, string>,
): Promise<Map<string, string>> {
  const excerpts = new Map<string, string>();

  for (const relPath of hashes.keys()) {
    const excerpt = await readTextExcerpt(path.join(root, relPath));
    if (excerpt) {
      excerpts.set(relPath, excerpt);
    }
  }

  return excerpts;
}

async function readTextExcerpt(filePath: string): Promise<string | undefined> {
  if (filePath.endsWith(".sqlite")) {
    return undefined;
  }

  try {
    const buffer = await readFile(filePath);
    const text = buffer.toString("utf8");

    if (text.includes("\u0000")) {
      return undefined;
    }

    return text.slice(0, 1200);
  } catch {
    return undefined;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}
