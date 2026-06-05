import type { EnvelopeWrite } from "./envelope.js";
import type {
  ChapterOutline,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";

export type WritingTarget = {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
};

export type WritingProjectState = {
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
};

export type WritingProposalPlan = {
  command: string;
  runRelPath: string;
  proposalRelPath: string;
  writes: EnvelopeWrite[];
};

export type ConfirmedDraftPlan = {
  runRelPath: string;
  sourcePath: string;
  target: WritingTarget;
  filledPlannedChapter: boolean;
  plannedChapterId: string | null;
  writes: EnvelopeWrite[];
};

export type ConfirmedRevisionPlan = {
  runRelPath: string;
  target: WritingTarget;
  baseHash: string;
  writes: EnvelopeWrite[];
};
