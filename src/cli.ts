#!/usr/bin/env node
import { Command } from "commander";
import { envelope, errorEnvelope } from "./protocol/envelope.js";
import { OpenAthorError } from "./protocol/errors.js";
import {
  runAdopt,
  runContext,
  runDoctor,
  runIndexRebuild,
  runInit,
  runOutlineArchive,
  runOutlineImpact,
  runOutlineInsert,
  runOutlineMerge,
  runOutlineMove,
  runOutlineReplan,
  runOutlineShow,
  runOutlineSplit,
  runSearchRelated,
  runSearchSemantic,
  runSearchText,
  runSkillInstallPi,
  runWritingProposal,
} from "./protocol/kernel.js";

const program = new Command();

program
  .name("openathor")
  .description("OpenAthor agent-facing CLI.")
  .version("0.1.0");

program
  .command("init")
  .description("Create an OpenAthor project skeleton.")
  .argument("[path]", "target directory")
  .option("--title <title>", "project title")
  .option("--language <tag>", "project language", "zh-CN")
  .option("--json", "emit JSON")
  .option("--dry-run", "show planned writes without changing files")
  .action(
    async (
      targetPath: string | undefined,
      options: {
        title?: string;
        language?: string;
        json?: boolean;
        dryRun?: boolean;
      },
    ) => {
      await emitResult(
        "openathor init",
        options.json,
        runInit({
          targetPath,
          title: options.title,
          language: options.language,
          dryRun: options.dryRun,
        }),
      );
    },
  );

program
  .command("adopt")
  .description("Adopt an existing manuscript directory without rewriting user files.")
  .argument("[path]", "target directory")
  .option("--json", "emit JSON")
  .option("--dry-run", "scan and plan without writing files")
  .option("--confirm-ambiguous", "write import questions even when order is ambiguous")
  .action(
    async (
      targetPath: string | undefined,
      options: {
        json?: boolean;
        dryRun?: boolean;
        confirmAmbiguous?: boolean;
      },
    ) => {
      await emitResult(
        "openathor adopt",
        options.json,
        runAdopt({
          targetPath,
          dryRun: options.dryRun,
          confirmAmbiguous: options.confirmAmbiguous,
        }),
      );
    },
  );

program
  .command("doctor")
  .description("Check an OpenAthor project.")
  .option("--json", "emit JSON")
  .option("--strict", "treat warnings as errors")
  .action(async (options: { json?: boolean; strict?: boolean }) => {
    await emitResult(
      "openathor doctor",
      options.json,
      runDoctor({ strict: options.strict }),
    );
  });

program
  .command("context")
  .description("Build a read-only context pack for an OpenAthor project.")
  .argument("[scope]", "context scope: project or chapter", "project")
  .argument("[target]", "chapter id or display order for chapter scope")
  .option("--json", "emit JSON")
  .option("--max-chars <count>", "maximum characters for the target chapter")
  .action(
    async (
      scope: string,
      target: string | undefined,
      options: { json?: boolean; maxChars?: string },
    ) => {
      if (scope !== "project" && scope !== "chapter") {
        await emitResult(
          "openathor context",
          options.json,
          Promise.reject(
            new OpenAthorError(
              "OA_CONTEXT_UNSUPPORTED_SCOPE",
              `Unsupported context scope ${scope}.`,
              { exitCode: 2 },
            ),
          ),
        );
        return;
      }

      await emitResult(
        scope === "chapter" ? "openathor context chapter" : "openathor context",
        options.json,
        runContext({
          scope,
          target,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    },
  );

const searchCommand = program
  .command("search")
  .description("Search OpenAthor plaintext sources.");

searchCommand
  .command("text")
  .description("Search manuscript, bible, notes, outline and reviews by text.")
  .argument("<query>", "search query")
  .option("--json", "emit JSON")
  .option("--limit <count>", "maximum matches to return")
  .option("--max-chars <count>", "maximum characters per snippet")
  .action(
    async (
      query: string,
      options: { json?: boolean; limit?: string; maxChars?: string },
    ) => {
      await emitResult(
        "openathor search text",
        options.json,
        runSearchText({
          query,
          limit: options.limit ? Number(options.limit) : undefined,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    },
  );

searchCommand
  .command("related")
  .description("Find deterministic related plaintext sources.")
  .argument("<scope>", "related search scope; currently chapter")
  .argument("<target>", "chapter id or display order")
  .option("--json", "emit JSON")
  .option("--limit <count>", "maximum matches to return")
  .option("--max-chars <count>", "maximum characters per snippet")
  .action(
    async (
      scope: string,
      target: string,
      options: { json?: boolean; limit?: string; maxChars?: string },
    ) => {
      if (scope !== "chapter") {
        await emitResult(
          "openathor search related",
          options.json,
          Promise.reject(
            new OpenAthorError(
              "OA_SEARCH_UNSUPPORTED_SCOPE",
              `Unsupported related search scope ${scope}.`,
              { exitCode: 2 },
            ),
          ),
        );
        return;
      }

      await emitResult(
        "openathor search related",
        options.json,
        runSearchRelated({
          scope,
          target,
          limit: options.limit ? Number(options.limit) : undefined,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    },
  );

searchCommand
  .command("semantic")
  .description("Search the optional derived vector index.")
  .argument("<query>", "semantic search query")
  .option("--json", "emit JSON")
  .option("--limit <count>", "maximum matches to return")
  .option("--max-chars <count>", "maximum characters per snippet")
  .action(
    async (
      query: string,
      options: { json?: boolean; limit?: string; maxChars?: string },
    ) => {
      await emitResult(
        "openathor search semantic",
        options.json,
        runSearchSemantic({
          query,
          limit: options.limit ? Number(options.limit) : undefined,
          maxChars: options.maxChars ? Number(options.maxChars) : undefined,
        }),
      );
    },
  );

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
  .description("Propose merging adjacent chapters without changing files.")
  .argument("<target>", "first chapter id or display order")
  .argument("<next>", "next adjacent chapter id or display order")
  .option("--title <title>", "proposed merged chapter title")
  .option("--json", "emit JSON")
  .option("--dry-run", "emit the proposal without changing files")
  .option("--diff", "show structured future diff without changing files")
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
          dryRun: options.dryRun,
          diff: options.diff,
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
  .description("Propose a replan boundary without changing files.")
  .requiredOption("--from <target>", "chapter id or display order where replanning starts")
  .requiredOption("--task <text>", "replan task")
  .option("--json", "emit JSON")
  .option("--dry-run", "emit the proposal without changing files")
  .option("--diff", "show structured future diff without changing files")
  .option("--max-chars <count>", "maximum characters per summary")
  .action(
    async (
      options: {
        from: string;
        task: string;
        json?: boolean;
        dryRun?: boolean;
        diff?: boolean;
        maxChars?: string;
      },
    ) => {
      await emitResult(
        "openathor outline replan",
        options.json,
        runOutlineReplan({
          from: options.from,
          task: options.task,
          dryRun: options.dryRun,
          diff: options.diff,
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

program
  .command("plan")
  .description("Create a planning proposal from the project context.")
  .argument("[target]", "optional target chapter id or display order")
  .requiredOption("--task <text>", "planning task")
  .option("--json", "emit JSON")
  .option("--dry-run", "show planned writes without changing files")
  .action(
    async (
      target: string | undefined,
      options: { task: string; json?: boolean; dryRun?: boolean },
    ) => {
      await emitResult(
        "openathor plan",
        options.json,
        runWritingProposal({
          kind: "plan",
          target,
          task: options.task,
          dryRun: options.dryRun,
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
  .action(
    async (
      scope: string,
      target: string,
      options: {
        task: string;
        text?: string;
        confirmWrite?: boolean;
        json?: boolean;
        dryRun?: boolean;
      },
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
  .option("--json", "emit JSON")
  .option("--dry-run", "show planned writes without changing files")
  .action(
    async (
      scope: string,
      target: string,
      options: { task: string; json?: boolean; dryRun?: boolean },
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
  .action(
    async (
      scope: string,
      target: string,
      options: {
        task: string;
        text?: string;
        confirmWrite?: boolean;
        baseHash?: string;
        json?: boolean;
        dryRun?: boolean;
      },
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
  .action(
    async (
      target: string | undefined,
      options: { task: string; json?: boolean; dryRun?: boolean },
    ) => {
      await emitResult(
        "openathor canon sync",
        options.json,
        runWritingProposal({
          kind: "canon_sync",
          target,
          task: options.task,
          dryRun: options.dryRun,
        }),
      );
    },
  );

program
  .command("index")
  .description("Manage derived indexes.")
  .command("rebuild")
  .description("Rebuild derived indexes from plaintext sources.")
  .option("--json", "emit JSON")
  .option("--dry-run", "show planned writes without changing files")
  .option("--vector", "also rebuild the optional derived vector index")
  .action(async (options: { json?: boolean; dryRun?: boolean; vector?: boolean }) => {
    await emitResult(
      "openathor index rebuild",
      options.json,
      runIndexRebuild({ dryRun: options.dryRun, vector: options.vector }),
    );
  });

program
  .command("skill")
  .description("Manage agent skills.")
  .command("install")
  .description("Install an OpenAthor skill.")
  .argument("<agent>", "target agent")
  .option("--json", "emit JSON")
  .option("--dry-run", "show planned writes without changing files")
  .option("--global", "install to the global Pi Agent skill directory")
  .action(
    async (
      agent: string,
      options: {
        json?: boolean;
        dryRun?: boolean;
        global?: boolean;
      },
    ) => {
      if (agent !== "pi") {
        await emitResult(
          "openathor skill install",
          options.json,
          Promise.reject(
            new OpenAthorError(
              "OA_SKILL_UNSUPPORTED_AGENT",
              `Unsupported skill target ${agent}.`,
              { exitCode: 2 },
            ),
          ),
        );
        return;
      }

      await emitResult(
        "openathor skill install pi",
        options.json,
        runSkillInstallPi({
          target: options.global ? "global" : "project",
          dryRun: options.dryRun,
        }),
      );
    },
  );

program.configureOutput({
  outputError: (message) => process.stderr.write(message),
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const openAthorError =
    error instanceof OpenAthorError
      ? error
      : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
          recoverable: false,
          exitCode: 5,
        });

  process.stderr.write(`${openAthorError.code}: ${openAthorError.message}\n`);
  process.exitCode = openAthorError.exitCode;
});

async function emitResult(
  command: string,
  json: boolean | undefined,
  promise: ReturnType<typeof runInit>,
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
    const openAthorError =
      error instanceof OpenAthorError
        ? error
        : new OpenAthorError("OA_INTERNAL_UNEXPECTED", String(error), {
            recoverable: false,
            exitCode: 5,
          });

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

async function emitChapterProposal(
  kind: "draft" | "review" | "revise",
  scope: string,
  target: string,
  options: {
    task: string;
    text?: string;
    confirmWrite?: boolean;
    baseHash?: string;
    json?: boolean;
    dryRun?: boolean;
  },
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
      dryRun: options.dryRun,
    }),
  );
}
