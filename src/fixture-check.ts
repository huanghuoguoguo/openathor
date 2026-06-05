#!/usr/bin/env node
import { Command } from "commander";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { envelope, errorEnvelope } from "./protocol/envelope.js";
import type { OpenAthorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import {
  runAdopt,
  runContext,
  runDoctor,
  runIndexRebuild,
  runInit,
  runOutlineArchive,
  runOutlineImpact,
  runOutlineShow,
  runSearchRelated,
  runSearchText,
  runSkillInstallPi,
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

async function runFixtureCheck(fixtureDir: string): Promise<{
  fixture: string;
  workspace: string;
  command_results: Array<{
    command: string;
    ok: boolean;
    error_code: string | null;
  }>;
  required_files: string[];
  absent_files: string[];
  unchanged_files: string[];
}> {
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
  const commandResults = [];

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

      commandResults.push({
        command: expectedCommand.run,
        ok: result.ok,
        error_code: result.error_code,
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
      });
    }

    return {
      fixture: fixtureDir,
      workspace,
      command_results: commandResults,
      required_files: expectedFiles.required ?? [],
      absent_files: [...(expectedFiles.absent ?? []), ...(expectedDisallowed.absent ?? [])],
      unchanged_files: expectedDisallowed.unchanged ?? [],
    };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
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
    return runIndexRebuild({ cwd, dryRun: parsed.options.dryRun });
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
    | "outline show"
    | "outline impact"
    | "outline archive"
    | "plan"
    | "draft"
    | "review"
    | "revise"
    | "canon sync"
    | "index rebuild"
    | "skill install pi";
  pathArg?: string;
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

    if (token === "--title") {
      index += 1;
      options.title = tokens[index];
      continue;
    }

    if (token === "--language") {
      index += 1;
      options.language = tokens[index];
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
      options.task = tokens[index];
      continue;
    }

    if (token === "--text") {
      index += 1;
      options.text = tokens[index];
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

    positional.push(token);
  }

  if (positional[0] === "index" && positional[1] === "rebuild") {
    return {
      display: "openathor index rebuild",
      name: "index rebuild",
      pathArg: positional[2],
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
  let current: unknown = data;

  for (const segment of dataPath.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return false;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current !== undefined && current !== null;
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
