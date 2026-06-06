import { OpenAthorError } from "../protocol/errors.js";
import type {
  FixtureCommandOptions,
  ParsedFixtureCommand,
} from "./types.js";

export function matchFixtureCommandRoute(
  command: string,
  positional: string[],
  options: FixtureCommandOptions,
): ParsedFixtureCommand {
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
    options.scope = positional[2] === "chapter" ? "chapter" : undefined;

    return {
      display: "openathor style revise",
      name: "style revise",
      pathArg: positional[3],
      options,
    };
  }

  if (
    positional[0] === "style" &&
    positional[1] === "profile" &&
    positional[2] === "show"
  ) {
    return {
      display: "openathor style profile show",
      name: "style profile show",
      options,
    };
  }

  if (
    positional[0] === "style" &&
    positional[1] === "profile" &&
    positional[2] === "apply"
  ) {
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

  if (positional[0] === "assets" && positional[1] === "sync") {
    options.scope = positional[2] === "chapter" ? "chapter" : undefined;

    return {
      display: "openathor assets sync",
      name: "assets sync",
      pathArg: positional[3],
      options,
    };
  }

  if (positional[0] === "assets" && positional[1] === "link-backfill") {
    return {
      display: "openathor assets link-backfill",
      name: "assets link-backfill",
      pathArg: positional[2],
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
