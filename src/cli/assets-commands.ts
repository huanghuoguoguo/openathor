import type { Command } from "commander";
import {
  runAssetsAudit,
  runAssetsLinkBackfill,
  runAssetsSync,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerAssetsCommands(program: Command): void {
  const assetsCommand = program
    .command("assets")
    .description("Audit and sync longform story assets and outline links.");

  assetsCommand
    .command("audit")
    .description("Check longform asset continuity without writing files.")
    .option("--json", "emit JSON")
    .option("--max-chars <count>", "maximum characters per snippet")
    .action(async (options: { json?: boolean; maxChars?: string }) => {
      await emitResult(
        "openathor assets audit",
        options.json,
        runAssetsAudit({
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    });

  assetsCommand
    .command("sync")
    .description("Sync an agent-provided structured asset package into pending or confirmed assets.")
    .argument("<scope>", "asset sync scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .requiredOption("--from <path>", "structured asset package JSON/YAML path")
    .option("--json", "emit JSON")
    .option("--confirm", "write confirmed assets if the source hash matches")
    .option("--dry-run", "show planned writes without changing files")
    .option("--base-hash <hash>", "expected current manuscript source hash")
    .action(
      async (
        scope: string,
        target: string,
        options: {
          from: string;
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          baseHash?: string;
        },
      ) => {
        await emitResult(
          "openathor assets sync",
          options.json,
          runAssetsSync({
            scope: scope === "chapter" ? "chapter" : undefined,
            target,
            from: options.from,
            confirm: options.confirm,
            dryRun: options.dryRun,
            baseHash: options.baseHash,
          }),
        );
      },
    );

  assetsCommand
    .command("link-backfill")
    .description("Backfill outline links from confirmed assets using deterministic text matches.")
    .argument("<kind>", "link kind; currently characters")
    .option("--json", "emit JSON")
    .option("--confirm", "write outline links if the outline hash matches")
    .option("--dry-run", "show planned writes without changing files")
    .option("--base-hash <hash>", "expected current outline/chapters.yaml hash")
    .action(
      async (
        kind: string,
        options: {
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          baseHash?: string;
        },
      ) => {
        await emitResult(
          "openathor assets link-backfill",
          options.json,
          runAssetsLinkBackfill({
            kind,
            confirm: options.confirm,
            dryRun: options.dryRun,
            baseHash: options.baseHash,
          }),
        );
      },
    );
}
