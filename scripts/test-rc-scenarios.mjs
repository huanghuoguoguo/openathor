#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFixtureCheck } from "../dist/fixture-check.js";
import { rcBlockingFixtures } from "../dist/rc-scenarios.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const results = [];

for (const fixture of rcBlockingFixtures) {
  const result = await runFixtureCheck(path.join(projectRoot, fixture));
  results.push({
    fixture,
    commands: result.command_results.length,
    file_changes: result.file_changes.length,
  });
}

process.stdout.write(`openathor-rc-scenarios: ${results.length} fixture(s): ok\n`);

for (const result of results) {
  process.stdout.write(
    `- ${result.fixture}: ${result.commands} command(s), ${result.file_changes} file change(s)\n`,
  );
}
