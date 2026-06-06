#!/usr/bin/env node
import { Command } from "commander";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { envelope, errorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import { callCommand, executeFixtureCommand } from "./fixture-check/command-runner.js";
import {
  checkAbsentFiles,
  checkCommandExpectation,
  checkDoctorExpectation,
  checkFileContains,
  checkRequiredFiles,
  checkUnchangedFiles,
  readExpectedJson,
  readExpectedYaml,
} from "./fixture-check/expectations.js";
import type {
  ExpectedCommands,
  ExpectedDisallowed,
  ExpectedDoctor,
  ExpectedFiles,
  FixtureCheckResult,
  FixtureCommandResult,
} from "./fixture-check/types.js";
import {
  collectFileChanges,
  hashExistingFiles,
  isDirectory,
  pathExists,
  removeGitkeepFiles,
  textExcerptsForHashes,
} from "./fixture-check/workspace-files.js";

export type {
  FixtureCheckResult,
  FixtureCommandResult,
  FixtureFileChange,
} from "./fixture-check/types.js";

const program = new Command();

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
      checkCommandExpectation(expectedCommand, result);

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
    await checkFileContains(workspace, expectedFiles.contains ?? {});
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
