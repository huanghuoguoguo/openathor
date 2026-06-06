import { envelope, errorEnvelope } from "../protocol/envelope.js";
import type { OpenAthorEnvelope } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import { parseCommand } from "./command-parser.js";
import { dispatchCommand } from "./dispatch.js";
import type {
  FixtureCommandCallResult,
  FixtureCommandEnvelopeResult,
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
