#!/usr/bin/env node
import {
  checkCommandExpectation,
  checkFileChangesCoveredByWrites,
  checkWritesBackedByFileChanges,
} from "../dist/fixture-check/expectations.js";

const baseEnvelope = {
  ok: true,
  command: "openathor test",
  run_id: null,
  protocol_version: "0.1",
  project: null,
  sources: [],
  writes: [],
  warnings: [],
  data: {},
  error: null,
};

const chapterCreated = {
  path: "manuscript/chapter-001.md",
  change_type: "created",
  before_hash: null,
  after_hash: "sha256:after",
};

const chapterWrite = {
  path: "manuscript/chapter-001.md",
  change_type: "created",
  reason: "self_test",
};

checkFileChangesCoveredByWrites(
  [chapterCreated],
  { ...baseEnvelope, writes: [chapterWrite] },
  "openathor test",
);

checkWritesBackedByFileChanges(
  [chapterCreated],
  { ...baseEnvelope, writes: [chapterWrite] },
  "openathor test",
);

checkWritesBackedByFileChanges(
  [],
  {
    ...baseEnvelope,
    writes: [{ path: "bible/", change_type: "created", reason: "directory_self_test" }],
  },
  "openathor test",
);

checkWritesBackedByFileChanges(
  [{ ...chapterCreated, path: "runs/run_20260608000100001.json" }],
  {
    ...baseEnvelope,
    writes: [{ path: "runs/run_*.json", change_type: "created", reason: "run_record" }],
  },
  "openathor test",
);

assertThrowsCode(
  "unreported file change",
  () => checkFileChangesCoveredByWrites([chapterCreated], baseEnvelope, "openathor test"),
  "OA_FIXTURE_UNREPORTED_FILE_CHANGE",
);

assertThrowsCode(
  "unbacked write",
  () =>
    checkWritesBackedByFileChanges(
      [],
      { ...baseEnvelope, writes: [chapterWrite] },
      "openathor test",
    ),
  "OA_FIXTURE_UNBACKED_WRITE",
);

assertThrowsCode(
  "failed command changed files",
  () =>
    checkCommandExpectation(
      { run: "openathor test", ok: false },
      {
        ok: false,
        error_code: "OA_SELF_TEST",
        envelope: {
          ...baseEnvelope,
          ok: false,
          error: { code: "OA_SELF_TEST" },
        },
      },
      [chapterCreated],
    ),
  "OA_FIXTURE_ERROR_COMMAND_CHANGED_FILES",
);

process.stdout.write("openathor-fixture-check-self: ok\n");

function assertThrowsCode(label, callback, expectedCode) {
  try {
    callback();
  } catch (error) {
    if (error && typeof error === "object" && error.code === expectedCode) {
      return;
    }

    throw new Error(
      `${label} expected ${expectedCode}, got ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(`${label} expected ${expectedCode}, but no error was thrown.`);
}
