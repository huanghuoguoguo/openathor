import { PROTOCOL_VERSION } from "./constants.js";
import type {
  ChapterOutline,
  IndexedChapter,
  ManuscriptIndex,
  ProjectConfig,
} from "./model.js";
import { buildStyleGuidance } from "./style-guidance.js";

export type ContextSourceText = {
  path: string;
  hash: string | null;
  text: string;
  truncated: boolean;
};

export type ContextMaxChars = {
  section: number;
  note: number;
  targetChapter: number;
  neighborChapter: number;
};

export function normalizeContextMaxChars(maxChars: number | undefined): ContextMaxChars {
  const base = Number.isFinite(maxChars) && maxChars && maxChars > 500 ? maxChars : 6000;

  return {
    section: Math.max(500, Math.floor(base / 3)),
    note: Math.max(300, Math.floor(base / 5)),
    targetChapter: base,
    neighborChapter: Math.max(500, Math.floor(base / 2)),
  };
}

export function contextWindow(chapters: IndexedChapter[], targetOrder: number): IndexedChapter[] {
  return chapters
    .filter((chapter) => {
      if (chapter.display_order === targetOrder) {
        return true;
      }

      return (
        chapter.status !== "archived" &&
        Math.abs(chapter.display_order - targetOrder) <= 1
      );
    })
    .sort((a, b) => a.display_order - b.display_order);
}

export function truncateText(text: string, maxChars: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
  };
}

export function contextData(input: {
  generatedAt: string;
  scope: string;
  targetInput?: string;
  targetChapter: IndexedChapter | null;
  maxChars: ContextMaxChars;
  config: ProjectConfig;
  chapters: ChapterOutline;
  manuscriptIndex: ManuscriptIndex;
  confirmedCanon: ContextSourceText;
  pendingCanon: ContextSourceText;
  style: ContextSourceText;
  styleProfiles: ContextSourceText;
  styleReferences: ContextSourceText;
  world: ContextSourceText;
  characters: ContextSourceText;
  timeline: ContextSourceText;
  notes: ContextSourceText[];
  manuscriptContext: Array<IndexedChapter & { content: ContextSourceText }>;
}): Record<string, unknown> {
  const styleGuidance = buildStyleGuidance({
    manualStyle: input.style,
    profiles: input.styleProfiles,
    references: input.styleReferences,
  });

  return {
    context_pack: {
      version: PROTOCOL_VERSION,
      generated_at: input.generatedAt,
      scope: input.scope,
      target: input.targetChapter
        ? {
            input: input.targetInput,
            id: input.targetChapter.id,
            display_order: input.targetChapter.display_order,
            title: input.targetChapter.title,
            source_path: input.targetChapter.source_path,
          }
        : null,
      max_chars: {
        section: input.maxChars.section,
        note: input.maxChars.note,
        target_chapter: input.maxChars.targetChapter,
        neighbor_chapter: input.maxChars.neighborChapter,
      },
      run_record: "not_written_read_only",
      style_guidance: styleGuidance,
    },
    project: {
      id: input.config.project.id,
      title: input.config.project.title,
      language: input.config.project.language,
      protocol_version: input.config.protocol_version,
    },
    outline: {
      chapter_count: input.chapters.chapters.length,
      chapters: input.chapters.chapters,
      target: input.targetChapter
        ? {
            id: input.targetChapter.id,
            display_order: input.targetChapter.display_order,
            title: input.targetChapter.title,
          }
        : null,
    },
    canon: {
      confirmed: input.confirmedCanon,
      pending: input.pendingCanon,
      questions: input.manuscriptIndex.questions ?? [],
    },
    style: input.style,
    style_profiles: {
      profiles: input.styleProfiles,
      references: input.styleReferences,
    },
    style_guidance: styleGuidance,
    assets: {
      world: input.world,
      characters: input.characters,
      timeline: input.timeline,
    },
    notes: input.notes,
    manuscript: {
      source_mode: input.manuscriptIndex.source_mode,
      indexed_chapters: input.manuscriptIndex.chapters.map((chapter) => ({
        id: chapter.id,
        display_order: chapter.display_order,
        title: chapter.title,
        source_path: chapter.source_path,
        status: chapter.status,
        origin: chapter.origin,
        confidence: chapter.confidence,
        content_hash: chapter.content_hash,
      })),
      context_chapters: input.manuscriptContext,
    },
  };
}
