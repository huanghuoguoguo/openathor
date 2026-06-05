import type { EnvelopeWrite } from "./envelope.js";
import type { ProjectConfig } from "./model.js";
import { PROTOCOL_VERSION } from "./constants.js";
import { stableProjectId } from "./identifiers.js";

export const DEFAULT_PATHS: ProjectConfig["paths"] = {
  bible: "bible",
  outline: "outline",
  manuscript: "manuscript",
  notes: "notes",
  reviews: "reviews",
  runs: "runs",
  manuscript_index: ".openathor/manuscript.index.yaml",
  sqlite_index: ".openathor/index.sqlite",
  vector_index: ".openathor/vector",
};

export const REQUIRED_DIRECTORIES = [
  "bible",
  "outline",
  "manuscript",
  "notes",
  "style",
  "reviews",
  "runs",
] as const;

export const STANDARD_ASSET_DIRECTORIES = ["style", "style/samples"] as const;

export const STANDARD_ASSET_FILES = [
  "bible/premise.md",
  "bible/style.md",
  "bible/world.md",
  "bible/characters.md",
  "bible/timeline.md",
  "bible/canon.md",
  "bible/canon.pending.md",
  "notes/hooks.md",
  "notes/unresolved.md",
  "notes/import-questions.md",
  "style/profiles.yaml",
  "style/references.yaml",
] as const;

export function createProjectConfig(title: string, language: string): ProjectConfig {
  return {
    protocol_version: PROTOCOL_VERSION,
    project: {
      id: stableProjectId(title),
      title,
      language,
      created_at: new Date().toISOString(),
      source_policy: "plaintext",
    },
    agent: {
      primary: "pi",
      skill: "openathor-pi",
      skill_version: PROTOCOL_VERSION,
    },
    paths: DEFAULT_PATHS,
    features: {
      vector_search: "optional",
      sub_agents: "optional",
    },
  };
}

export function skeletonWrites(reason: string): EnvelopeWrite[] {
  return [
    "openathor.yaml",
    "bible/",
    "outline/",
    "outline/volumes.yaml",
    "outline/chapters.yaml",
    "outline/scenes.yaml",
    "manuscript/",
    "notes/",
    "style/",
    "style/samples/",
    ...STANDARD_ASSET_FILES,
    "reviews/",
    "runs/",
    ".openathor/",
    ".openathor/manuscript.index.yaml",
  ].map((relPath) => ({
    path: relPath,
    change_type: "created" as const,
    reason,
  }));
}

export function adoptWrites(): EnvelopeWrite[] {
  return [
    ...skeletonWrites("adopt_project_skeleton"),
    {
      path: ".openathor/import-report.md",
      change_type: "created" as const,
      reason: "adopt_import_report",
    },
    {
      path: "runs/run_*.json",
      change_type: "created" as const,
      reason: "adopt_run_record",
    },
  ];
}
