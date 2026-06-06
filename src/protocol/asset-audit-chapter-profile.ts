import { characterAssetProfileCoverage } from "./asset-coverage.js";
import type {
  AssetAuditCatalog,
  AssetAuditState,
} from "./asset-audit-model.js";
import type { AuditChapter } from "./asset-audit-chapter-context.js";

export function recordLinkedCharacterProfileCoverage(input: {
  catalog: AssetAuditCatalog;
  state: AssetAuditState;
  chapter: AuditChapter;
  sourcePath: string | null;
  chapterText: string;
  linkedCharacters: string[];
}): void {
  for (const link of input.linkedCharacters) {
    const character = input.catalog.knownCharacters.get(link);

    if (!character) {
      continue;
    }

    const profileCoverage = characterAssetProfileCoverage(
      character,
      [input.chapter.title, input.chapter.summary ?? "", input.chapterText].join("\n"),
    );

    if (profileCoverage.checked_fields > 0) {
      input.state.characterProfileCoverage.push({
        id: input.chapter.id,
        display_order: input.chapter.display_order,
        title: input.chapter.title,
        character_id: character.id,
        character_name: character.name,
        source_path: input.sourcePath,
        ...profileCoverage,
      });
    }
  }
}