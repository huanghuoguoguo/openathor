import type { Command } from "commander";
import {
  runOutlineArchive,
  runOutlineImpact,
  runOutlineInsert,
  runOutlineMerge,
  runOutlineMove,
  runOutlineReplan,
  runOutlineShow,
  runOutlineSplit,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerOutlineCommands(program: Command): void {
  const outlineCommand = program
    .command("outline")
    .description("Inspect and safely edit OpenAthor outline metadata.");

  outlineCommand
    .command("show")
    .description("Show chapter outline metadata.")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }) => {
      await emitResult("openathor outline show", options.json, runOutlineShow());
    });

  outlineCommand
    .command("impact")
    .description("Analyze references and likely impact before archiving a chapter.")
    .argument("<target>", "chapter id or display order")
    .option("--json", "emit JSON")
    .option("--max-chars <count>", "maximum characters per snippet")
    .action(
      async (target: string, options: { json?: boolean; maxChars?: string }) => {
        await emitResult(
          "openathor outline impact",
          options.json,
          runOutlineImpact({
            target,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
          }),
        );
      },
    );

  outlineCommand
    .command("insert")
    .description("Insert a planned chapter in outline metadata without moving manuscript files.")
    .requiredOption("--after <target>", "chapter id or display order to insert after")
    .requiredOption("--title <title>", "planned chapter title")
    .option("--json", "emit JSON")
    .option("--confirm", "perform the insert write")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "show structured diff without changing files")
    .action(
      async (
        options: {
          after: string;
          title: string;
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          diff?: boolean;
        },
      ) => {
        await emitResult(
          "openathor outline insert",
          options.json,
          runOutlineInsert({
            after: options.after,
            title: options.title,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
          }),
        );
      },
    );

  outlineCommand
    .command("move")
    .description("Move chapter display order without moving manuscript files.")
    .argument("<target>", "chapter id or display order to move")
    .requiredOption("--after <target>", "chapter id or display order to move after")
    .option("--json", "emit JSON")
    .option("--confirm", "perform the move write")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "show structured diff without changing files")
    .action(
      async (
        target: string,
        options: {
          after: string;
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          diff?: boolean;
        },
      ) => {
        await emitResult(
          "openathor outline move",
          options.json,
          runOutlineMove({
            target,
            after: options.after,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
          }),
        );
      },
    );

  outlineCommand
    .command("merge")
    .description("Propose or confirm merging adjacent chapters.")
    .argument("<target>", "first chapter id or display order")
    .argument("<next>", "next adjacent chapter id or display order")
    .option("--title <title>", "proposed merged chapter title")
    .option("--json", "emit JSON")
    .option("--dry-run", "emit the proposal without changing files")
    .option("--diff", "show structured future diff without changing files")
    .option("--confirm", "write confirmed merge if both source hashes match")
    .option("--base-hash <hash>", "expected current target manuscript source hash")
    .option("--next-base-hash <hash>", "expected current next manuscript source hash")
    .option("--max-chars <count>", "maximum characters for merged preview")
    .action(
      async (
        target: string,
        next: string,
        options: {
          title?: string;
          json?: boolean;
          dryRun?: boolean;
          diff?: boolean;
          confirm?: boolean;
          baseHash?: string;
          nextBaseHash?: string;
          maxChars?: string;
        },
      ) => {
        await emitResult(
          "openathor outline merge",
          options.json,
          runOutlineMerge({
            target,
            next,
            title: options.title,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
            baseHash: options.baseHash,
            nextBaseHash: options.nextBaseHash,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
          }),
        );
      },
    );

  outlineCommand
    .command("split")
    .description("Propose or confirm a chapter split.")
    .argument("<target>", "chapter id or display order to split")
    .requiredOption("--at-line <line>", "first source line of the second split segment")
    .requiredOption("--title-before <title>", "title for the first proposed segment")
    .requiredOption("--title-after <title>", "title for the second proposed segment")
    .option("--json", "emit JSON")
    .option("--confirm", "perform the split write")
    .option("--dry-run", "emit the proposal without changing files")
    .option("--diff", "show structured future diff without changing files")
    .option("--max-chars <count>", "maximum characters per segment preview")
    .option("--base-hash <hash>", "expected current manuscript source hash")
    .action(
      async (
        target: string,
        options: {
          atLine: string;
          titleBefore: string;
          titleAfter: string;
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          diff?: boolean;
          maxChars?: string;
          baseHash?: string;
        },
      ) => {
        await emitResult(
          "openathor outline split",
          options.json,
          runOutlineSplit({
            target,
            atLine: Number(options.atLine),
            titleBefore: options.titleBefore,
            titleAfter: options.titleAfter,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
            baseHash: options.baseHash,
          }),
        );
      },
    );

  outlineCommand
    .command("replan")
    .description("Propose or confirm replanning future outline chapters.")
    .requiredOption("--from <target>", "chapter id or display order where replanning starts")
    .requiredOption("--task <text>", "replan task")
    .option("--from-package <path>", "structured replan package JSON/YAML path")
    .option("--json", "emit JSON")
    .option("--confirm", "write confirmed replan if the outline hash matches")
    .option("--dry-run", "emit the proposal without changing files")
    .option("--diff", "show structured future diff without changing files")
    .option("--base-hash <hash>", "expected current outline/chapters.yaml hash")
    .option("--max-chars <count>", "maximum characters per summary")
    .action(
      async (
        options: {
          from: string;
          task: string;
          fromPackage?: string;
          json?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          diff?: boolean;
          baseHash?: string;
          maxChars?: string;
        },
      ) => {
        await emitResult(
          "openathor outline replan",
          options.json,
          runOutlineReplan({
            from: options.from,
            task: options.task,
            fromPackage: options.fromPackage,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
            baseHash: options.baseHash,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
          }),
        );
      },
    );

  outlineCommand
    .command("archive")
    .description("Archive chapter metadata without deleting manuscript files.")
    .argument("<target>", "chapter id or display order")
    .option("--json", "emit JSON")
    .option("--keep-facts", "preserve facts and manuscript content", true)
    .option("--confirm", "perform the archive write")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "show structured diff without changing files")
    .option("--base-hash <hash>", "expected current manuscript source hash")
    .action(
      async (
        target: string,
        options: {
          json?: boolean;
          keepFacts?: boolean;
          confirm?: boolean;
          dryRun?: boolean;
          diff?: boolean;
          baseHash?: string;
        },
      ) => {
        await emitResult(
          "openathor outline archive",
          options.json,
          runOutlineArchive({
            target,
            keepFacts: options.keepFacts,
            confirm: options.confirm,
            dryRun: options.dryRun,
            diff: options.diff,
            baseHash: options.baseHash,
          }),
        );
      },
    );
}
