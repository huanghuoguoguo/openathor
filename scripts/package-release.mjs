#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const releaseDir = path.resolve(projectRoot, process.argv[2] ?? "release");
const bundleRoot = path.join(releaseDir, "openathor");
const tarballPath = path.join(releaseDir, "openathor.tar.gz");
const checksumPath = `${tarballPath}.sha256`;

await assertExists(path.join(projectRoot, "dist", "cli.js"), "Run npm run build first.");
await rm(releaseDir, { recursive: true, force: true });
await mkdir(bundleRoot, { recursive: true });

for (const file of ["package.json", "package-lock.json", "README.md"]) {
  await copyFile(path.join(projectRoot, file), path.join(bundleRoot, file));
}

await run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--prefix", bundleRoot]);
await cp(path.join(projectRoot, "dist"), path.join(bundleRoot, "dist"), {
  recursive: true,
});
await cp(path.join(projectRoot, "schemas"), path.join(bundleRoot, "schemas"), {
  recursive: true,
});

for (const bin of ["cli.js", "fixture-check.js", "judge-smoke.js"]) {
  await chmod(path.join(bundleRoot, "dist", bin), 0o755);
}

await run("tar", ["-czf", tarballPath, "-C", releaseDir, "openathor"]);
const checksum = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
await writeFile(checksumPath, `${checksum}  openathor.tar.gz\n`);

process.stdout.write(`release/openathor.tar.gz\n`);
process.stdout.write(`release/openathor.tar.gz.sha256\n`);

async function assertExists(filePath, message) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${filePath} is missing. ${message}`);
  }
}

async function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}.`);
  }
}
