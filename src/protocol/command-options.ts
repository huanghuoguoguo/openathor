import type {
  EnvelopeSource,
  EnvelopeWarning,
  EnvelopeWrite,
} from "./envelope.js";

export type CommandResult = {
  projectRoot?: string;
  projectId?: string | null;
  sources?: EnvelopeSource[];
  writes?: EnvelopeWrite[];
  warnings?: EnvelopeWarning[];
  data?: unknown;
};

export type InitOptions = {
  targetPath?: string;
  title?: string;
  language?: string;
  dryRun?: boolean;
};

export type AdoptOptions = {
  targetPath?: string;
  dryRun?: boolean;
  confirmAmbiguous?: boolean;
};

export type DoctorOptions = {
  cwd?: string;
  strict?: boolean;
};

export type IndexRebuildOptions = {
  cwd?: string;
  dryRun?: boolean;
  vector?: boolean;
};

export type ExportOptions = {
  cwd?: string;
  format?: string;
  out?: string;
  dryRun?: boolean;
};

export type SkillInstallOptions = {
  cwd?: string;
  target?: "project" | "global";
  dryRun?: boolean;
};

export type NotImplementedOptions = {
  command: string;
  feature: string;
  hints?: string[];
};

export type StyleProfileShowOptions = {
  cwd?: string;
  maxChars?: number;
};

export type StyleAnalyzeOptions = {
  cwd?: string;
  referencePath?: string;
  profileId?: string;
  name?: string;
  permission?: string;
  sourceType?: string;
  dryRun?: boolean;
};

export type StyleProfileApplyOptions = {
  cwd?: string;
  profileId?: string;
  confirm?: boolean;
  diff?: boolean;
  dryRun?: boolean;
  baseHash?: string;
};

export type StyleCheckOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  maxChars?: number;
};

export type StyleReviseOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  goal?: string;
  text?: string;
  confirmWrite?: boolean;
  baseHash?: string;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
};

export type AssetsAuditOptions = {
  cwd?: string;
  maxChars?: number;
};

export type AssetsSyncOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  from?: string;
  confirm?: boolean;
  dryRun?: boolean;
  baseHash?: string;
  assetHashes?: string[];
};

export type AssetsLinkBackfillOptions = {
  cwd?: string;
  kind?: string;
  confirm?: boolean;
  dryRun?: boolean;
  baseHash?: string;
};

export type ContextOptions = {
  cwd?: string;
  scope?: "project" | "chapter";
  target?: string;
  maxChars?: number;
};

export type OutlineShowOptions = {
  cwd?: string;
};

export type OutlineImpactOptions = {
  cwd?: string;
  target?: string;
  maxChars?: number;
};

export type OutlineInsertOptions = {
  cwd?: string;
  after?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

export type OutlineMoveOptions = {
  cwd?: string;
  target?: string;
  after?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
};

export type OutlineMergeOptions = {
  cwd?: string;
  target?: string;
  next?: string;
  title?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
  nextBaseHash?: string;
};

export type OutlineSplitOptions = {
  cwd?: string;
  target?: string;
  atLine?: number;
  titleBefore?: string;
  titleAfter?: string;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
  baseHash?: string;
};

export type OutlineReplanOptions = {
  cwd?: string;
  from?: string;
  task?: string;
  fromPackage?: string;
  confirm?: boolean;
  baseHash?: string;
  dryRun?: boolean;
  diff?: boolean;
  maxChars?: number;
};

export type OutlineArchiveOptions = {
  cwd?: string;
  target?: string;
  keepFacts?: boolean;
  confirm?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  baseHash?: string;
};

export type WritingProposalKind = "plan" | "draft" | "review" | "revise" | "canon_sync";

export type WritingProposalOptions = {
  cwd?: string;
  kind: WritingProposalKind;
  target?: string;
  task?: string;
  dryRun?: boolean;
  diff?: boolean;
  multiAgent?: boolean;
  reviewRoles?: string[];
  text?: string;
  confirm?: boolean;
  confirmWrite?: boolean;
  baseHash?: string;
};

export type SearchTextOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};

export type SearchRelatedOptions = {
  cwd?: string;
  scope?: "chapter";
  target?: string;
  limit?: number;
  maxChars?: number;
};

export type SearchSemanticOptions = {
  cwd?: string;
  query?: string;
  limit?: number;
  maxChars?: number;
};
