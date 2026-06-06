import { OpenAthorError } from "../protocol/errors.js";
import type {
  FixtureCommandOptions,
  ParsedFixtureCommand,
} from "./types.js";

export function parseCommand(command: string): ParsedFixtureCommand {
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

  const options: FixtureCommandOptions = {};
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

    if (token === "--from") {
      index += 1;
      options.from = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--from-package") {
      index += 1;
      options.fromPackage = unescapeFixtureArgument(tokens[index]);
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

    if (token === "--goal") {
      index += 1;
      options.goal = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--text") {
      index += 1;
      options.text = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--profile-id") {
      index += 1;
      options.profileId = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--name") {
      index += 1;
      options.name = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--permission") {
      index += 1;
      options.permission = unescapeFixtureArgument(tokens[index]);
      continue;
    }

    if (token === "--source-type") {
      index += 1;
      options.sourceType = unescapeFixtureArgument(tokens[index]);
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

    if (token === "--next-base-hash") {
      index += 1;
      options.nextBaseHash = tokens[index];
      continue;
    }

    if (token === "--after") {
      index += 1;
      options.after = unescapeFixtureArgument(tokens[index]);
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

function unescapeFixtureArgument(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
