import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import { sha256File } from "../protocol/paths.js";
import { pathExists } from "./workspace-files.js";
import type {
  ExpectedCommand,
  ExpectedDoctor,
  FixtureCommandEnvelopeResult,
} from "./types.js";

export async function readExpectedYaml<T>(
  dir: string,
  filename: string,
): Promise<T> {
  const filePath = path.join(dir, filename);
  const text = await readFile(filePath, "utf8");
  return parseYaml(text) as T;
}

export async function readExpectedJson<T>(
  dir: string,
  filename: string,
): Promise<T> {
  const filePath = path.join(dir, filename);
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

export function checkCommandExpectation(
  expectedCommand: ExpectedCommand,
  result: FixtureCommandEnvelopeResult,
): void {
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

  for (const warningCode of expectedCommand.expect_warnings ?? []) {
    if (!result.envelope.warnings.some((warning) => warning.code === warningCode)) {
      throw new OpenAthorError(
        "OA_FIXTURE_COMMAND_FAILED",
        `Command ${expectedCommand.run} missing warning ${warningCode}.`,
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
}

export function checkDoctorExpectation(
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

export async function checkRequiredFiles(
  root: string,
  files: string[],
): Promise<void> {
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

export async function checkAbsentFiles(
  root: string,
  files: string[],
): Promise<void> {
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

export async function checkUnchangedFiles(
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
