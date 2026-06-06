import type { OpenAthorEnvelope } from "../protocol/envelope.js";

export type ExpectedCommand = {
  run: string;
  ok?: boolean;
  error_code?: string;
  expect_data_path?: string;
  expect_data?: Record<string, unknown>;
  expect_warnings?: string[];
  expect_no_writes?: boolean;
};

export type ExpectedCommands = {
  commands: ExpectedCommand[];
};

export type ExpectedFiles = {
  required?: string[];
  absent?: string[];
  contains?: Record<string, string[]>;
};

export type ExpectedDisallowed = {
  unchanged?: string[];
  absent?: string[];
};

export type ExpectedDoctor = {
  ok: boolean;
  checks?: Record<string, boolean>;
};

export type FixtureCommandEnvelopeResult = {
  ok: boolean;
  error_code: string | null;
  envelope: OpenAthorEnvelope;
};

export type FixtureCommandCallResult = FixtureCommandEnvelopeResult & {
  wasJsonEnvelope: boolean;
};

export type FixtureCommandResult = FixtureCommandEnvelopeResult & {
  command: string;
};

export type FixtureFileChange = {
  path: string;
  change_type: "created" | "modified" | "deleted";
  before_hash: string | null;
  after_hash: string | null;
  before_excerpt?: string;
  after_excerpt?: string;
};

export type FixtureCheckResult = {
  fixture: string;
  workspace: string;
  command_results: FixtureCommandResult[];
  required_files: string[];
  absent_files: string[];
  unchanged_files: string[];
  file_changes: FixtureFileChange[];
};

export type FixtureCommandName =
  | "init"
  | "adopt"
  | "doctor"
  | "context"
  | "search text"
  | "search related"
  | "search semantic"
  | "assets audit"
  | "assets sync"
  | "assets link-backfill"
  | "outline show"
  | "outline impact"
  | "outline insert"
  | "outline move"
  | "outline merge"
  | "outline split"
  | "outline replan"
  | "outline archive"
  | "plan"
  | "draft"
  | "review"
  | "revise"
  | "canon sync"
  | "export"
  | "style analyze"
  | "style check"
  | "style revise"
  | "style profile show"
  | "style profile apply"
  | "index rebuild"
  | "skill install pi";

export type FixtureCommandOptions = {
  title?: string;
  language?: string;
  dryRun?: boolean;
  strict?: boolean;
  confirmAmbiguous?: boolean;
  global?: boolean;
  confirm?: boolean;
  diff?: boolean;
  keepFacts?: boolean;
  scope?: "project" | "chapter";
  maxChars?: number;
  limit?: number;
  task?: string;
  goal?: string;
  text?: string;
  profileId?: string;
  name?: string;
  permission?: string;
  sourceType?: string;
  confirmWrite?: boolean;
  baseHash?: string;
  assetHashes?: string[];
  nextBaseHash?: string;
  fromPackage?: string;
  from?: string;
  after?: string;
  atLine?: number;
  titleBefore?: string;
  titleAfter?: string;
  vector?: boolean;
  format?: string;
  out?: string;
};

export type ParsedFixtureCommand = {
  display: string;
  name: FixtureCommandName;
  pathArg?: string;
  secondPathArg?: string;
  options: FixtureCommandOptions;
};
