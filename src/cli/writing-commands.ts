import type { Command } from "commander";
import { OpenAthorError } from "../protocol/errors.js";
import { runWritingProposal } from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

type ChapterProposalOptions = {
  task: string;
  text?: string;
  confirmWrite?: boolean;
  baseHash?: string;
  multiAgent?: boolean;
  reviewRole?: string[];
  json?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

export function registerWritingCommands(program: Command): void {
  program
    .command("plan")
    .description("Create a planning proposal from the project context.")
    .argument("[target]", "optional target chapter id or display order")
    .requiredOption("--task <text>", "planning task")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "preview proposal writes without changing files")
    .action(
      async (
        target: string | undefined,
        options: { task: string; json?: boolean; dryRun?: boolean; diff?: boolean },
      ) => {
        await emitResult(
          "openathor plan",
          options.json,
          runWritingProposal({
            kind: "plan",
            target,
            task: options.task,
            dryRun: options.dryRun,
            diff: options.diff,
          }),
        );
      },
    );

  program
    .command("draft")
    .description("Create a draft task package without writing manuscript text.")
    .argument("<scope>", "draft scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .requiredOption("--task <text>", "drafting task")
    .option("--text <text>", "confirmed manuscript text for draft chapter next")
    .option("--confirm-write", "write a confirmed new draft chapter")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "preview proposal writes without changing files")
    .action(
      async (
        scope: string,
        target: string,
        options: ChapterProposalOptions,
      ) => {
        await emitChapterProposal("draft", scope, target, options);
      },
    );

  program
    .command("review")
    .description("Create review notes grounded in a chapter context.")
    .argument("<scope>", "review scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .requiredOption("--task <text>", "review task")
    .option("--multi-agent", "create a structured multi-role review pack")
    .option("--review-role <role>", "include a specific review role; repeat for multiple roles", collectValues, [])
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "preview proposal writes without changing files")
    .action(
      async (
        scope: string,
        target: string,
        options: ChapterProposalOptions,
      ) => {
        await emitChapterProposal("review", scope, target, options);
      },
    );

  program
    .command("revise")
    .description("Create a revision proposal without modifying manuscript files.")
    .argument("<scope>", "revision scope; currently chapter")
    .argument("<target>", "chapter id or display order")
    .requiredOption("--task <text>", "revision task")
    .option("--text <text>", "confirmed replacement manuscript text")
    .option("--confirm-write", "write a confirmed revision if --base-hash matches")
    .option("--base-hash <hash>", "expected current source hash")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "preview proposal writes without changing files")
    .action(
      async (
        scope: string,
        target: string,
        options: ChapterProposalOptions,
      ) => {
        await emitChapterProposal("revise", scope, target, options);
      },
    );

  program
    .command("canon")
    .description("Manage canon proposals.")
    .command("sync")
    .description("Create a pending canon sync proposal.")
    .argument("[target]", "optional target chapter id or display order")
    .requiredOption("--task <text>", "canon sync task")
    .option("--json", "emit JSON")
    .option("--dry-run", "show planned writes without changing files")
    .option("--diff", "preview pending canon proposal without changing files")
    .action(
      async (
        target: string | undefined,
        options: { task: string; json?: boolean; dryRun?: boolean; diff?: boolean },
      ) => {
        await emitResult(
          "openathor canon sync",
          options.json,
          runWritingProposal({
            kind: "canon_sync",
            target,
            task: options.task,
            dryRun: options.dryRun,
            diff: options.diff,
          }),
        );
      },
    );
}

async function emitChapterProposal(
  kind: "draft" | "review" | "revise",
  scope: string,
  target: string,
  options: ChapterProposalOptions,
): Promise<void> {
  if (scope !== "chapter") {
    await emitResult(
      `openathor ${kind}`,
      options.json,
      Promise.reject(
        new OpenAthorError(
          "OA_CONTEXT_UNSUPPORTED_SCOPE",
          `Unsupported ${kind} scope ${scope}.`,
          { exitCode: 2 },
        ),
      ),
    );
    return;
  }

  await emitResult(
    `openathor ${kind}`,
    options.json,
    runWritingProposal({
      kind,
      target,
      task: options.task,
      text: options.text,
      confirmWrite: options.confirmWrite,
      baseHash: options.baseHash,
      multiAgent: options.multiAgent,
      reviewRoles: options.reviewRole,
      dryRun: options.dryRun,
      diff: options.diff,
    }),
  );
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}
