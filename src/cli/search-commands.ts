import type { Command } from "commander";
import { OpenAthorError } from "../protocol/errors.js";
import {
  runSearchRelated,
  runSearchSemantic,
  runSearchText,
} from "../protocol/kernel.js";
import { emitResult } from "./emit.js";

export function registerSearchCommands(program: Command): void {
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
}
