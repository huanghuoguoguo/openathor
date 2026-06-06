export type ProjectConfig = {
  protocol_version: string;
  project: {
    id: string;
    title: string;
    language: string;
    created_at: string;
    source_policy: "plaintext";
  };
  agent: {
    primary: "pi";
    skill: string;
    skill_version: string;
  };
  paths: {
    bible: string;
    outline: string;
    manuscript: string;
    notes: string;
    reviews: string;
    runs: string;
    manuscript_index: string;
    sqlite_index: string;
    vector_index: string;
  };
  features: {
    vector_search: "optional";
    sub_agents: "optional";
  };
};

export type ChapterOutline = {
  chapters: Array<{
    id: string;
    display_order: number;
    title: string;
    status: "planned" | "drafted" | "reviewed" | "revised" | "archived";
    manuscript_path?: string;
    summary?: string;
    scenes?: string[];
    links?: Record<string, unknown>;
  }>;
};

export type ChapterOutlineEntry = ChapterOutline["chapters"][number];

export type ManuscriptIndex = {
  version: string;
  generated_at: string;
  source_mode: "created" | "adopted" | "standardized";
  chapters: IndexedChapter[];
  unclassified?: Array<{ path: string; reason: string }>;
  questions?: Array<{ id: string; path: string; question: string; reason?: string }>;
};

export type IndexedChapter = {
  id: string;
  display_order: number;
  title: string;
  source_path: string;
  status: "existing" | "drafted" | "revised" | "archived";
  origin: "created" | "adopted" | "standardized";
  content_hash: string;
  detected_title?: string;
  confidence: "high" | "medium" | "low";
};

export type ClassifiedFile = {
  path: string;
  kind: "chapter" | "note" | "style_reference" | "scrap" | "unclassified";
  title: string;
  order: number | null;
  reason: string;
};
