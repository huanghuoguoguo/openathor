import type {
  ChapterOutlineEntry,
  IndexedChapter,
} from "./project-model.js";

export type OutlineReplanChapterInput = {
  id: string | null;
  title: string;
  status: ChapterOutlineEntry["status"];
  summary: string | null;
  scenes: string[];
  links: Record<string, unknown> | null;
};

export type OutlineReplanPackage = {
  chapters: OutlineReplanChapterInput[];
};

export type OutlineReplanPlan = {
  package: OutlineReplanPackage;
  preserved_before: ChapterOutlineEntry[];
  replaced_chapters: ChapterOutlineEntry[];
  replacement_chapters: ChapterOutlineEntry[];
  archived_index_chapters: IndexedChapter[];
};

export type ResolvedOutlineChapter = {
  input: string;
  outlineChapter: ChapterOutlineEntry | null;
  indexedChapter: IndexedChapter | null;
  id: string;
  display_order: number;
  title: string;
  source_path: string | null;
  outline_status: ChapterOutlineEntry["status"] | null;
  index_status: IndexedChapter["status"] | null;
};

export type OutlineSplitSegment = {
  title: string;
  line_start: number;
  line_end: number;
  char_count: number;
  preview: string;
  starts_with_heading: boolean;
};

export type OutlineSplitPlan = {
  split_at_line: number;
  line_count: number;
  before: OutlineSplitSegment;
  after: OutlineSplitSegment;
};

export type OutlineSplitParts = OutlineSplitPlan & {
  before_text: string;
  after_text: string;
};
