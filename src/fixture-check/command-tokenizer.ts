import { OpenAthorError } from "../protocol/errors.js";

export function tokenizeFixtureCommand(command: string): string[] {
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

  return tokens;
}

export function unescapeFixtureArgument(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
