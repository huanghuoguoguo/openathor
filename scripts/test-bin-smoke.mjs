#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const binEntries = Object.entries(packageJson.bin ?? {});

if (binEntries.length === 0) {
  throw new Error("package.json must declare bin entries.");
}

await assertPackagedBinsAreExecutable(binEntries);

const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "openathor-bin-smoke-"));

try {
  const binDir = path.join(tmpRoot, ".bin");
  await mkdir(binDir, { recursive: true });

  for (const [binName, relPath] of binEntries) {
    const targetPath = path.resolve(projectRoot, relPath);
    const firstLine = (await readFile(targetPath, "utf8")).split(/\r?\n/, 1)[0];

    if (firstLine !== "#!/usr/bin/env node") {
      throw new Error(`${relPath} is missing a Node shebang.`);
    }

    await symlink(targetPath, path.join(binDir, binName));
  }

  const openathor = path.join(binDir, "openathor");
  const fixtureCheck = path.join(binDir, "openathor-fixture-check");
  const judgeSmoke = path.join(binDir, "openathor-judge-smoke");
  const demoRoot = path.join(tmpRoot, "demo");

  const version = await run(openathor, ["--version"], projectRoot);
  assertIncludes(version.stdout.trim(), packageJson.version, "openathor --version");

  const initResult = await run(
    openathor,
    ["init", demoRoot, "--title", "Bin Smoke", "--json"],
    projectRoot,
  );
  assertJsonOk(initResult.stdout, "openathor init");

  const doctorResult = await run(openathor, ["doctor", "--json"], demoRoot);
  assertJsonOk(doctorResult.stdout, "openathor doctor");

  await assertJsonError(
    openathor,
    ["--json", "does-not-exist"],
    projectRoot,
    "OA_COMMAND_NOT_IMPLEMENTED",
  );
  await assertJsonError(
    fixtureCheck,
    ["--json"],
    projectRoot,
    "OA_FIXTURE_NOT_FOUND",
  );
  await assertJsonError(
    judgeSmoke,
    ["--json", "--scenario", "__missing__"],
    projectRoot,
    "OA_JUDGE_SCENARIO_NOT_FOUND",
  );

  process.stdout.write(`openathor-bin-smoke: ${binEntries.length} bin(s): ok\n`);
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

async function assertPackagedBinsAreExecutable(entries) {
  const pack = await run("npm", ["pack", "--dry-run", "--json"], projectRoot);
  const packData = JSON.parse(pack.stdout);
  const files = new Map(packData[0].files.map((file) => [file.path, file]));

  for (const [, relPath] of entries) {
    const packagePath = relPath.replace(/^\.\//, "");
    const file = files.get(packagePath);

    if (!file) {
      throw new Error(`npm pack is missing bin target ${packagePath}.`);
    }

    if ((file.mode & 0o111) === 0) {
      throw new Error(`npm pack bin target is not executable: ${packagePath}.`);
    }
  }
}

async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      "stderr" in error &&
      "code" in error
    ) {
      return error;
    }

    throw error;
  }
}

function assertJsonOk(stdout, label) {
  const output = JSON.parse(stdout);
  if (output.ok !== true) {
    throw new Error(`${label} expected ok=true, got ${stdout}`);
  }
}

async function assertJsonError(command, args, cwd, expectedCode) {
  const result = await run(command, args, cwd);
  const output = JSON.parse(result.stdout);

  if (typeof result.code !== "number" || result.code === 0) {
    throw new Error(
      `${command} ${args.join(" ")} expected a non-zero exit code, got ${String(result.code)}.`,
    );
  }

  if (output.ok !== false || output.error?.code !== expectedCode) {
    throw new Error(
      `${command} ${args.join(" ")} expected ${expectedCode}, got ${result.stdout}`,
    );
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}.`);
  }
}
