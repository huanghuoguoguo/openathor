import type { Command } from "commander";
import {
  runStyleAnalyze,
  runStyleCheck,
  runStyleProfileApply,
  runStyleProfileShow,
  runStyleRevise,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerStyleCommands(program: Command): void {
  const styleCommand = program
    .command("style")
    .description("Manage style guidance profiles.")
    .exitOverride();

  styleCommand
    .command("analyze")
    .description("Analyze an authorized style reference into an abstract profile.")
    .argument("<path>", "authorized style reference path")
    .option("--json", "emit JSON")
    .option("--profile-id <id>", "pending style profile id")
    .option("--name <name>", "pending style profile name")
    .option("--permission <permission>", "reference permission", "user_owned_or_authorized")
    .option("--source-type <type>", "reference source type", "user_provided")
    .option("--dry-run", "show planned writes without changing files")
    .action(async (
      referencePath: string,
      options: {
        json?: boolean;
        profileId?: string;
        name?: string;
        permission?: string;
        sourceType?: string;
        dryRun?: boolean;
      },
    ) => {
      await emitResult(
        "openathor style analyze",
        options.json,
        runStyleAnalyze({
          referencePath,
          profileId: options.profileId,
          name: options.name,
          permission: options.permission,
          sourceType: options.sourceType,
          dryRun: options.dryRun,
        }),
      );
    });

  styleCommand
    .command("check")
    .description("Check chapter style consistency against the project profile.")
    .argument("<scope>", "style check scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .option("--json", "emit JSON")
    .option("--max-chars <count>", "maximum characters per snippet")
    .action(async (
      scope: string,
      target: string,
      options: { json?: boolean; maxChars?: string },
    ) => {
      await emitResult(
        "openathor style check",
        options.json,
        runStyleCheck({
          scope: scope === "chapter" ? "chapter" : undefined,
          target,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    });

  styleCommand
    .command("revise")
    .description("Create or confirm a style-guided revision.")
    .argument("<scope>", "style revision scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .option("--goal <text>", "style revision goal")
    .option("--text <text>", "confirmed replacement manuscript text")
    .option("--confirm-write", "write a confirmed style revision if --base-hash matches")
    .option("--base-hash <hash>", "expected current source hash")
    .option("--diff", "show structured diff without changing files")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--max-chars <count>", "maximum characters per style finding snippet")
    .action(async (
      scope: string,
      target: string,
      options: {
        goal?: string;
        text?: string;
        confirmWrite?: boolean;
        baseHash?: string;
        diff?: boolean;
        json?: boolean;
        dryRun?: boolean;
        maxChars?: string;
      },
    ) => {
      await emitResult(
        "openathor style revise",
        options.json,
        runStyleRevise({
          scope: scope === "chapter" ? "chapter" : undefined,
          target,
          goal: options.goal,
          text: options.text,
          confirmWrite: options.confirmWrite,
          baseHash: options.baseHash,
          diff: options.diff,
          dryRun: options.dryRun,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    });

  const styleProfileCommand = styleCommand
    .command("profile")
    .description("Inspect or apply style profiles.");

  styleProfileCommand
    .command("show")
    .description("Show the current style profile.")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }) => {
      await emitResult(
        "openathor style profile show",
        options.json,
        runStyleProfileShow(),
      );
    });

  styleProfileCommand
    .command("apply")
    .description("Apply a confirmed style profile.")
    .argument("<profile>", "style profile id")
    .option("--json", "emit JSON")
    .option("--diff", "show structured diff without changing files")
    .option("--confirm", "write confirmed profile activation")
    .option("--base-hash <hash>", "expected hash for style/profiles.yaml")
    .option("--dry-run", "show planned writes without changing files")
    .action(async (
      profile: string,
      options: {
        json?: boolean;
        diff?: boolean;
        confirm?: boolean;
        baseHash?: string;
        dryRun?: boolean;
      },
    ) => {
      await emitResult(
        "openathor style profile apply",
        options.json,
        runStyleProfileApply({
          profileId: profile,
          diff: options.diff,
          confirm: options.confirm,
          baseHash: options.baseHash,
          dryRun: options.dryRun,
        }),
      );
    });
}
