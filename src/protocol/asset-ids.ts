import type { AssetEntity } from "./model.js";

export function isAssetIdForKind(id: string, kind: AssetEntity["kind"]): boolean {
  const normalized = id.toLowerCase();
  if (isLegacyAssetIdForKind(normalized, kind)) {
    return true;
  }

  if (kind === "character") {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(normalized);
  }
  if (kind === "timeline_event") {
    return normalized.startsWith("event-");
  }
  if (kind === "hook") {
    return normalized.startsWith("hook-");
  }

  return /^(loc|org|item|world)[_-]/.test(normalized);
}

export function isLegacyAssetIdForKind(id: string, kind: AssetEntity["kind"]): boolean {
  const normalized = id.toLowerCase();
  if (kind === "character") {
    return normalized.startsWith("char_");
  }
  if (kind === "timeline_event") {
    return normalized.startsWith("ev_");
  }
  if (kind === "hook") {
    return normalized.startsWith("hook_");
  }

  return /^(loc|org|item|world)_/.test(normalized);
}
