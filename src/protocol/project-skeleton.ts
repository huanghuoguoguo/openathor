import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PROTOCOL_VERSION } from "./constants.js";
import type {
  EnvelopeWarning,
  EnvelopeWrite,
} from "./envelope.js";
import {
  REQUIRED_DIRECTORIES,
  STANDARD_ASSET_DIRECTORIES,
} from "./project-layout.js";
import {
  writeText,
  writeYaml,
} from "./project-files.js";
import { runStamp } from "./run-stamp.js";
import type {
  ChapterOutline,
  ClassifiedFile,
  IndexedChapter,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";

export async function writeProjectSkeleton(
  projectRoot: string,
  config: ProjectConfig,
  input: {
    sourceMode: ManuscriptIndex["source_mode"];
    chapters: IndexedChapter[];
    unclassified: Array<{ path: string; reason: string }>;
    questions: ManuscriptIndex["questions"];
    chapterOutline?: ChapterOutline;
    extraWrites: EnvelopeWrite[];
  },
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });

  for (const dir of REQUIRED_DIRECTORIES) {
    await mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  for (const dir of STANDARD_ASSET_DIRECTORIES) {
    await mkdir(path.join(projectRoot, dir), { recursive: true });
  }

  await mkdir(path.join(projectRoot, ".openathor"), { recursive: true });

  await writeYaml(projectRoot, "openathor.yaml", config);
  await writeText(projectRoot, "bible/premise.md", "# Premise\n\n");
  await writeText(projectRoot, "bible/style.md", "# Style\n\n");
  await writeText(projectRoot, "bible/world.md", "# World\n\n");
  await writeText(projectRoot, "bible/characters.md", "# Characters\n\n");
  await writeText(projectRoot, "bible/timeline.md", "# Timeline\n\n");
  await writeText(projectRoot, "bible/canon.md", "# Confirmed Canon\n\n");
  await writeText(projectRoot, "bible/canon.pending.md", "# Pending Canon\n\n");
  await writeText(projectRoot, "notes/hooks.md", "# Hooks\n\n");
  await writeText(projectRoot, "notes/unresolved.md", "# Unresolved Questions\n\n");
  await writeText(projectRoot, "notes/import-questions.md", "# Import Questions\n\n");
  await writeYaml(projectRoot, "style/profiles.yaml", { profiles: [] });
  await writeYaml(projectRoot, "style/references.yaml", { references: [] });
  await writeYaml(projectRoot, "outline/volumes.yaml", { volumes: [] });
  await writeYaml(projectRoot, "outline/chapters.yaml", input.chapterOutline ?? { chapters: [] });
  await writeYaml(projectRoot, "outline/scenes.yaml", { scenes: [] });
  await writeYaml(projectRoot, ".openathor/manuscript.index.yaml", {
    version: PROTOCOL_VERSION,
    generated_at: new Date().toISOString(),
    source_mode: input.sourceMode,
    chapters: input.chapters,
    unclassified: input.unclassified,
    questions: input.questions,
  });
}

export async function writeAdoptSidecars(
  projectRoot: string,
  input: {
    notes: ClassifiedFile[];
    styleReferences: ClassifiedFile[];
    scraps: ClassifiedFile[];
    unclassified: ClassifiedFile[];
    questions: ManuscriptIndex["questions"];
    warnings: EnvelopeWarning[];
  },
): Promise<void> {
  const report = [
    "# Import Report",
    "",
    "## Detected Notes",
    ...input.notes.map((file) => `- ${file.path}`),
    "",
    "## Style References",
    ...input.styleReferences.map((file) => `- ${file.path}`),
    "",
    "## Unclassified Or Scrap Files",
    ...[...input.scraps, ...input.unclassified].map((file) => `- ${file.path}: ${file.reason}`),
    "",
    "## Warnings",
    ...input.warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
    "",
  ].join("\n");

  const questions = [
    "# Import Questions",
    "",
    ...(input.questions ?? []).map(
      (question) => `- [ ] ${question.path}: ${question.question}`,
    ),
    "",
  ].join("\n");

  await writeText(projectRoot, ".openathor/import-report.md", report);
  await writeText(projectRoot, "notes/import-questions.md", questions);
  await writeText(
    projectRoot,
    "bible/canon.pending.md",
    "# Pending Canon\n\nImported notes are pending until the user confirms them.\n",
  );
  await writeText(
    projectRoot,
    "bible/style.md",
    "# Style\n\nStyle references are detected but not copied into confirmed style rules.\n",
  );
  await writeYaml(projectRoot, `runs/run_${runStamp()}.json`, {
    agent_role: "openathor-cli",
    command: "openathor adopt",
    created_at: new Date().toISOString(),
    warnings: input.warnings,
  });
}
