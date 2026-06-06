import type {
  AssetAuditCatalog,
  AssetAuditState,
  OutlineLinkIssue,
} from "./asset-audit-model.js";
import { addLinkedAssetRef, isSameAssetReference } from "./asset-markdown.js";
import type { AssetEntity } from "./model.js";
import type { AuditChapter } from "./asset-audit-chapter-context.js";

export function recordLinkedAssets(input: {
  linkedAssetRefs: Set<string>;
  outlineLinkIssues: OutlineLinkIssue[];
  links: string[];
  lookup: Map<string, AssetEntity>;
  chapter: AuditChapter;
  type: OutlineLinkIssue["type"];
  label: string;
}): void {
  for (const link of input.links) {
    addLinkedAssetRef(input.linkedAssetRefs, input.lookup.get(link), link);

    if (!input.lookup.has(link)) {
      input.outlineLinkIssues.push({
        type: input.type,
        chapter_id: input.chapter.id,
        display_order: input.chapter.display_order,
        link,
        message: `Chapter ${input.chapter.id} links unknown ${input.label} ${link}.`,
      });
    }
  }
}

export function recordCharacterSummaryTexts(input: {
  catalog: AssetAuditCatalog;
  state: AssetAuditState;
  linkedCharacters: string[];
  mentionedCharacters: string[];
  fullText: string;
}): void {
  for (const character of input.catalog.characters) {
    const linked = input.linkedCharacters.some((link) =>
      isSameAssetReference(link, character),
    );
    const mentioned = input.mentionedCharacters.includes(character.name);

    if (linked || mentioned) {
      const key = character.id ?? character.name;
      input.state.characterProfileSummaryTexts.set(key, [
        ...(input.state.characterProfileSummaryTexts.get(key) ?? []),
        input.fullText,
      ]);
    }
  }
}