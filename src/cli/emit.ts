import { envelope, errorEnvelope } from "../protocol/envelope.js";
import { OpenAthorError } from "../protocol/errors.js";
import type { CommandResult } from "../protocol/model.js";

export async function emitResult(
  command: string,
  json: boolean | undefined,
  promise: Promise<CommandResult>,
): Promise<void> {
  try {
    const result = await promise;
    const output = envelope({
      ok: true,
      command,
      projectRoot: result.projectRoot,
      projectId: result.projectId,
      sources: result.sources,
      writes: result.writes,
      warnings: result.warnings,
      data: result.data,
    });

    if (json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return;
    }

    process.stdout.write(`${command}: ok\n`);
  } catch (error: unknown) {
    const openAthorError = toOpenAthorError(error);

    if (json) {
      process.stdout.write(
        `${JSON.stringify(errorEnvelope(command, openAthorError), null, 2)}\n`,
      );
    } else {
      process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
    }

    process.exitCode = openAthorError.exitCode;
  }
}

export function toOpenAthorError(error: unknown): OpenAthorError {
  return error instanceof OpenAthorError
    ? error
    : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
        recoverable: false,
        exitCode: 5,
      });
}
