import type { FixtureCommandOptions } from "./types.js";
import { unescapeFixtureArgument } from "./command-tokenizer.js";

export type ParsedFixtureCommandArguments = {
  options: FixtureCommandOptions;
  positional: string[];
};

export function parseCommandArguments(tokens: string[]): ParsedFixtureCommandArguments {
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

    if (token === "--multi-agent") {
      options.multiAgent = true;
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

    if (token === "--review-role") {
      index += 1;
      options.reviewRoles = [
        ...(options.reviewRoles ?? []),
        unescapeFixtureArgument(tokens[index]),
      ];
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

    if (token === "--assets-hash") {
      index += 1;
      options.assetHashes = [...(options.assetHashes ?? []), tokens[index]];
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

  return { options, positional };
}
