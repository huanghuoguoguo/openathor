import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorEnvelope } from "../protocol/envelope.js";
import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import { resolveFixtureHash } from "./hash-placeholders.js";
import {
  tokenizeFixtureCommand,
  unescapeFixtureArgument,
} from "./command-tokenizer.js";
import type {
  FixtureCommandCallResult,
  FixtureCommandEnvelopeResult,
} from "./types.js";

const execFileAsync = promisify(execFile);
const cliUrl = new URL("../cli.js", import.meta.url);

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
  const args = await fixtureCliArgs(command, cwd);
  let stdout = "";

  try {
    const result = await execFileAsync(process.execPath, [cliUrl.pathname, ...args], {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (error: unknown) {
    if (isExecErrorWithStdout(error)) {
      stdout = error.stdout;
    } else {
      const openAthorError =
        error instanceof OpenAthorError
          ? error
          : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
              recoverable: false,
              exitCode: 5,
            });
      const output = errorEnvelope(command, openAthorError);

      return {
        ok: false,
        error_code: openAthorError.code,
        wasJsonEnvelope: isJsonEnvelope(output),
        envelope: output,
      };
    }
  }

  const output = parseJsonEnvelope(stdout, command);
  return {
    ok: output.ok,
    error_code: output.error?.code ?? null,
    wasJsonEnvelope: isJsonEnvelope(output),
    envelope: output,
  };
}

async function fixtureCliArgs(command: string, cwd: string): Promise<string[]> {
  const tokens = tokenizeFixtureCommand(command);
  const args: string[] = [];

  for (const token of tokens.slice(1)) {
    args.push(await resolveFixtureToken(cwd, token));
  }

  return args;
}

async function resolveFixtureToken(cwd: string, token: string): Promise<string> {
  if (token.startsWith("current:") || token.includes("=current:")) {
    return resolveFixtureHash(cwd, token);
  }

  return unescapeFixtureArgument(token);
}

function parseJsonEnvelope(stdout: string, command: string): OpenAthorEnvelope {
  try {
    const output = JSON.parse(stdout) as unknown;
    if (!isJsonEnvelope(output)) {
      throw new Error("missing envelope fields");
    }

    return output;
  } catch (error: unknown) {
    throw new OpenAthorError(
      "OA_FIXTURE_COMMAND_FAILED",
      `Command ${command} did not produce a valid JSON envelope: ${String(error)}`,
      { exitCode: 4 },
    );
  }
}

function isExecErrorWithStdout(error: unknown): error is { stdout: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    typeof (error as { stdout?: unknown }).stdout === "string"
  );
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
