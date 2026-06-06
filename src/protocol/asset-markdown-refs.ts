import type { AssetEntity } from "./model.js";

export function assetLookup(entities: AssetEntity[]): Map<string, AssetEntity> {
  const lookup = new Map<string, AssetEntity>();

  for (const entity of entities) {
    lookup.set(entity.name, entity);
    if (entity.id) {
      lookup.set(entity.id, entity);
    }
  }

  return lookup;
}

export function addLinkedAssetRef(
  linkedAssetRefs: Set<string>,
  entity: AssetEntity | undefined,
  original: string,
): void {
  linkedAssetRefs.add(original);

  if (entity) {
    linkedAssetRefs.add(entity.name);
    if (entity.id) {
      linkedAssetRefs.add(entity.id);
    }
  }
}

export function assetSummaryKey(entity: AssetEntity): string {
  return entity.id ?? entity.name;
}

export function isSameAssetReference(value: string, entity: AssetEntity): boolean {
  return value === entity.name || (entity.id !== null && value === entity.id);
}

export function stringLinks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}
