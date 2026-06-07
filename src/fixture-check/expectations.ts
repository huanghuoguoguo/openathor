import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import type { EnvelopeWrite } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import { sha256File } from "../protocol/paths.js";
import { pathExists } from "./workspace-files.js";
import type {
  ExpectedCommand,
  ExpectedDoctor,
  ExpectedFileChange,
  ExpectedWrite,
  FixtureFileChange,
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
  fileChanges: FixtureFileChange[] = [],
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
    if (!isDeepEqual(actualValue, expectedValue)) {
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

  if (expectedCommand.expect_no_writes && fileChanges.length > 0) {
    throw new OpenAthorError(
      "OA_FIXTURE_COMMAND_FAILED",
      `Command ${expectedCommand.run} changed files, expected none: ${formatFileChanges(fileChanges)}`,
      { exitCode: 4 },
    );
  }

  if (!result.ok && !expectedCommand.allow_writes_on_error && fileChanges.length > 0) {
    throw new OpenAthorError(
      "OA_FIXTURE_ERROR_COMMAND_CHANGED_FILES",
      `Failed command ${expectedCommand.run} changed files: ${formatFileChanges(fileChanges)}`,
      { exitCode: 4 },
    );
  }

  checkExpectedWrites(
    expectedCommand.run,
    result.envelope.writes,
    expectedCommand.expect_writes ?? [],
  );
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

export async function checkFileContains(
  root: string,
  expectedContents: Record<string, string[]>,
): Promise<void> {
  for (const [relPath, snippets] of Object.entries(expectedContents)) {
    const fullPath = path.join(root, relPath);
    if (!(await pathExists(fullPath))) {
      throw new OpenAthorError(
        "OA_FIXTURE_EXPECTED_FILE_MISSING",
        `Expected file is missing: ${relPath}`,
        { exitCode: 4 },
      );
    }

    const text = await readFile(fullPath, "utf8");
    for (const snippet of snippets) {
      if (!text.includes(snippet)) {
        throw new OpenAthorError(
          "OA_FIXTURE_FILE_CONTENT_MISMATCH",
          `Expected ${relPath} to contain ${JSON.stringify(snippet)}.`,
          { exitCode: 4 },
        );
      }
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

export function checkFileChangesCoveredByWrites(
  fileChanges: FixtureFileChange[],
  envelope: OpenAthorEnvelope,
  command: string,
): void {
  for (const fileChange of fileChanges) {
    if (envelope.writes.some((write) => writeCoversFileChange(write, fileChange))) {
      continue;
    }

    throw new OpenAthorError(
      "OA_FIXTURE_UNREPORTED_FILE_CHANGE",
      `Command ${command} changed ${fileChange.change_type} ${fileChange.path} without a matching write.`,
      { exitCode: 4 },
    );
  }
}

export function checkWritesBackedByFileChanges(
  fileChanges: FixtureFileChange[],
  envelope: OpenAthorEnvelope,
  command: string,
): void {
  for (const write of envelope.writes) {
    if (write.path.endsWith("/")) {
      continue;
    }

    if (fileChanges.some((fileChange) => writeCoversFileChange(write, fileChange))) {
      continue;
    }

    throw new OpenAthorError(
      "OA_FIXTURE_UNBACKED_WRITE",
      `Command ${command} reported ${write.change_type} ${write.path} without a matching file change.`,
      { exitCode: 4 },
    );
  }
}

export function checkExpectedFileChanges(
  actualChanges: FixtureFileChange[],
  expectedChanges: ExpectedFileChange[],
): void {
  if (expectedChanges.length === 0) {
    return;
  }

  const unmatchedActual = [...actualChanges];

  for (const expected of expectedChanges) {
    const index = unmatchedActual.findIndex((actual) =>
      fileChangeMatches(expected, actual),
    );
    if (index >= 0) {
      unmatchedActual.splice(index, 1);
      continue;
    }

    throw new OpenAthorError(
      "OA_FIXTURE_EXPECTED_FILE_CHANGE_MISSING",
      `Expected file change did not occur: ${formatExpectedFileChange(expected)}`,
      { exitCode: 4 },
    );
  }

  if (unmatchedActual.length > 0) {
    const actual = unmatchedActual[0];
    throw new OpenAthorError(
      "OA_FIXTURE_UNEXPECTED_FILE_CHANGE",
      `Unexpected file change occurred: ${actual.change_type} ${actual.path}`,
      { exitCode: 4 },
    );
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

function isDeepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => isDeepEqual(item, right[index]));
  }

  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!isDeepEqual(leftKeys, rightKeys)) {
      return false;
    }

    return leftKeys.every((key) => isDeepEqual(left[key], right[key]));
  }

  return false;
}

function fileChangeMatches(
  expected: ExpectedFileChange,
  actual: FixtureFileChange,
): boolean {
  return (
    pathPatternMatches(expected.path, actual.path) &&
    (!expected.change_type || expected.change_type === actual.change_type)
  );
}

function formatExpectedFileChange(expected: ExpectedFileChange): string {
  return expected.change_type
    ? `${expected.change_type} ${expected.path}`
    : expected.path;
}

function checkExpectedWrites(
  command: string,
  actualWrites: EnvelopeWrite[],
  expectedWrites: ExpectedWrite[],
): void {
  if (expectedWrites.length === 0) {
    return;
  }

  const unmatchedActual = [...actualWrites];

  for (const expected of expectedWrites) {
    const index = unmatchedActual.findIndex((actual) =>
      writeMatchesExpectation(expected, actual),
    );
    if (index >= 0) {
      unmatchedActual.splice(index, 1);
      continue;
    }

    throw new OpenAthorError(
      "OA_FIXTURE_EXPECTED_WRITE_MISSING",
      `Command ${command} did not report expected write: ${formatExpectedWrite(expected)}`,
      { exitCode: 4 },
    );
  }
}

function writeMatchesExpectation(expected: ExpectedWrite, actual: EnvelopeWrite): boolean {
  return (
    pathPatternMatches(expected.path, actual.path) &&
    (!expected.change_type || expected.change_type === actual.change_type) &&
    (!expected.reason || expected.reason === actual.reason)
  );
}

function formatExpectedWrite(expected: ExpectedWrite): string {
  return [
    expected.change_type,
    expected.path,
    expected.reason ? `reason=${expected.reason}` : null,
  ]
    .filter((part) => part)
    .join(" ");
}

function writeCoversFileChange(
  write: EnvelopeWrite,
  fileChange: FixtureFileChange,
): boolean {
  return (
    pathPatternMatches(write.path, fileChange.path) &&
    writeChangeTypeCovers(write.change_type, fileChange.change_type)
  );
}

function writeChangeTypeCovers(
  writeType: EnvelopeWrite["change_type"],
  actualType: FixtureFileChange["change_type"],
): boolean {
  if (writeType === actualType) {
    return true;
  }

  return writeType === "replaced" && (actualType === "created" || actualType === "modified");
}

function formatFileChanges(fileChanges: FixtureFileChange[]): string {
  return fileChanges
    .map((fileChange) => `${fileChange.change_type} ${fileChange.path}`)
    .join(", ");
}

function pathPatternMatches(pattern: string, pathValue: string): boolean {
  if (!pattern.includes("*")) {
    return pattern === pathValue;
  }

  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(pathValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
