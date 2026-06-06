import {
  runAssetsAudit,
  runAssetsLinkBackfill,
  runAssetsSync,
  type CommandResult,
} from "../protocol/kernel.js";
import { resolveFixtureHash } from "./hash-placeholders.js";
import type { ParsedFixtureCommand } from "./types.js";

export async function dispatchAssetsCommand(
  parsed: ParsedFixtureCommand,
  cwd: string,
): Promise<CommandResult | null> {
  if (parsed.name === "assets audit") {
    return runAssetsAudit({
      cwd,
      maxChars: parsed.options.maxChars,
    });
  }

  if (parsed.name === "assets sync") {
    return runAssetsSync({
      cwd,
      scope: parsed.options.scope === "chapter" ? "chapter" : undefined,
      target: parsed.pathArg,
      from: parsed.options.from,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
      assetHashes: parsed.options.assetHashes
        ? await Promise.all(
            parsed.options.assetHashes.map((value) => resolveFixtureHash(cwd, value)),
          )
        : undefined,
    });
  }

  if (parsed.name === "assets link-backfill") {
    return runAssetsLinkBackfill({
      cwd,
      kind: parsed.pathArg,
      confirm: parsed.options.confirm,
      dryRun: parsed.options.dryRun,
      baseHash: parsed.options.baseHash
        ? await resolveFixtureHash(cwd, parsed.options.baseHash)
        : undefined,
    });
  }

  return null;
}
