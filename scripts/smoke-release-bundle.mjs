#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const tarballPath = path.resolve(projectRoot, process.argv[2] ?? "release/openathor.tar.gz");
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "openathor-release-smoke-"));

try {
  await run("tar", ["-xzf", tarballPath, "-C", tmpRoot], projectRoot);

  const bundleRoot = path.join(tmpRoot, "openathor");
  const openathor = path.join(bundleRoot, "dist", "cli.js");
  const fixtureCheck = path.join(bundleRoot, "dist", "fixture-check.js");
  const judgeSmoke = path.join(bundleRoot, "dist", "judge-smoke.js");
  const demoRoot = path.join(tmpRoot, "demo");

  const version = await run(openathor, ["--version"], bundleRoot);
  assertIncludes(version.stdout.trim(), packageJson.version, "openathor --version");

  assertJsonOk(
    await run(
      openathor,
      ["init", demoRoot, "--title", "Release Smoke", "--json"],
      bundleRoot,
    ),
    "openathor init",
  );
  assertJsonOk(await run(openathor, ["doctor", "--json"], demoRoot), "openathor doctor");
  assertJsonOk(
    await run(openathor, ["skill", "install", "pi", "--json"], demoRoot),
    "openathor skill install pi",
  );
  assertJsonOk(
    await run(openathor, ["context", "project", "--json"], demoRoot),
    "openathor context project",
  );
  assertJsonOk(
    await run(
      openathor,
      [
        "draft",
        "chapter",
        "next",
        "--task",
        "Write the first release-smoke chapter.",
        "--text",
        "# 第一章\n\n雨夜里，灯塔第一次亮起。",
        "--confirm-write",
        "--json",
      ],
      demoRoot,
    ),
    "openathor draft chapter next --confirm-write",
  );
  assertJsonOk(
    await run(openathor, ["index", "rebuild", "--json"], demoRoot),
    "openathor index rebuild",
  );

  const fixtureRoot = path.join(tmpRoot, "release-fixture");
  await createReleaseFixture(fixtureRoot);
  assertJsonOk(
    await run(fixtureCheck, [fixtureRoot, "--json"], bundleRoot),
    "openathor-fixture-check",
  );

  assertJsonOk(
    await run(
      judgeSmoke,
      ["--scenario", "draft-confirm-write", "--json"],
      projectRoot,
    ),
    "openathor-judge-smoke",
  );

  process.stdout.write("openathor-release-smoke: ok\n");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

async function createReleaseFixture(fixtureRoot) {
  const expectedDir = path.join(fixtureRoot, "expected");
  await mkdir(path.join(fixtureRoot, "input"), { recursive: true });
  await mkdir(expectedDir, { recursive: true });

  await writeFile(
    path.join(expectedDir, "commands.yaml"),
    [
      "commands:",
      '  - run: openathor init --json --title "Release Fixture"',
      "    ok: true",
      "  - run: openathor skill install pi --json",
      "    ok: true",
      "  - run: openathor context project --json",
      "    ok: true",
      "  - run: openathor draft chapter next --task \"Release fixture chapter\" --text \"# 第一章\\n\\n这是发布包 fixture 写入的章节。\" --confirm-write --json",
      "    ok: true",
      "    expect_data:",
      "      target.source_path: manuscript/chapter-001.md",
      "    expect_writes:",
      "      - path: manuscript/chapter-001.md",
      "        change_type: created",
      "        reason: confirmed_draft_chapter",
      "      - path: outline/chapters.yaml",
      "        change_type: modified",
      "        reason: confirmed_draft_chapter_outline",
      "      - path: .openathor/manuscript.index.yaml",
      "        change_type: modified",
      "        reason: confirmed_draft_chapter_index",
      "      - path: runs/run_*_draft_confirmed.json",
      "        change_type: created",
      "        reason: confirmed_draft_run_record",
      "  - run: openathor index rebuild --json",
      "    ok: true",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(expectedDir, "files.yaml"),
    [
      "required:",
      "  - openathor.yaml",
      "  - .pi/skills/openathor/SKILL.md",
      "  - manuscript/chapter-001.md",
      "  - outline/chapters.yaml",
      "  - .openathor/manuscript.index.yaml",
      "  - .openathor/index.sqlite",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(expectedDir, "disallowed.yaml"), "unchanged: []\n");
  await writeFile(
    path.join(expectedDir, "doctor.json"),
    `${JSON.stringify(
      {
        ok: true,
        checks: {
          openathor_yaml: true,
          required_directories: true,
          outline_chapters: true,
          manuscript_index: true,
          source_paths_exist: true,
        },
      },
      null,
      2,
    )}\n`,
  );
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

function assertJsonOk(result, label) {
  const output = JSON.parse(result.stdout);

  if (output.ok !== true) {
    throw new Error(`${label} expected ok=true, got ${result.stdout}`);
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}.`);
  }
}
