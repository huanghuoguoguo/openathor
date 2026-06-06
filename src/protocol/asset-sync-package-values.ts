import { isAssetIdForKind } from "./asset-ids.js";
import { OpenAthorError } from "./errors.js";
import type { AssetEntity } from "./model.js";
import { optionalString } from "./value.js";

export function stringArray(value: unknown): string[] {
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

export function uniqueStringArray(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .slice(0, 100);
}

export function requiredAssetSyncId(
  value: unknown,
  kind: AssetEntity["kind"],
  section: string,
  index: number,
): string {
  const id = requiredAssetSyncString(value, section, index, "id");
  if (!isAssetIdForKind(id, kind)) {
    throw invalidAssetSyncItem(section, index, `id ${id} is not valid for ${kind}`);
  }

  return id;
}

export function requiredAssetSyncString(
  value: unknown,
  section: string,
  index: number,
  field: string,
): string {
  const text = optionalString(value);
  if (!text) {
    throw invalidAssetSyncItem(section, index, `requires ${field}`);
  }

  return text;
}

export function invalidAssetSyncItem(
  section: string,
  index: number,
  reason: string,
): OpenAthorError {
  return new OpenAthorError(
    "OA_ASSETS_SYNC_PACKAGE_INVALID",
    `Invalid asset sync package item ${section}.${index}: ${reason}.`,
    { exitCode: 3 },
  );
}
