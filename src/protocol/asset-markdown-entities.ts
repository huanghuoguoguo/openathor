import { isAssetIdForKind, isLegacyAssetIdForKind } from "./asset-ids.js";
import { extractAssetProfileFields } from "./asset-markdown-profile.js";
import type { AssetEntity } from "./model.js";

export function extractMarkdownEntities(
  text: string,
  sourcePath: string,
  kind: AssetEntity["kind"],
): AssetEntity[] {
  const entities = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const heading = line.match(/^#{2,6}\s+(.+)$/u)?.[1]?.trim();
    const inlineEntity = parseInlineAssetEntity(heading ?? line, kind, Boolean(heading));
    const listEntity = !heading ? parseListAssetEntity(lines, index, kind) : null;
    const idField = heading
      ? findAssetIdField(lines, index + 1, kind)
      : inlineEntity?.id ?? null;
    const id = inlineEntity?.id ?? listEntity?.id ?? idField;
    const name = cleanAssetName(inlineEntity?.name ?? listEntity?.name ?? heading ?? "");

    if (!name || isGenericAssetHeading(name)) {
      continue;
    }

    const key = `${kind}:${name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entities.push({
      id,
      name,
      source_path: sourcePath,
      line: index + 1,
      kind,
      profile: extractAssetProfileFields(lines, index, kind),
    });
  }

  return entities.slice(0, 200);
}

function parseInlineAssetEntity(
  value: string,
  kind: AssetEntity["kind"],
  allowNameOnly: boolean,
): { id: string | null; name: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const idFirst = trimmed.match(/^([a-z][a-z0-9_:-]{2,})\s*[:：]\s*(.+)$/iu);
  if (idFirst && isLegacyAssetIdForKind(idFirst[1], kind)) {
    return { id: idFirst[1], name: idFirst[2] };
  }

  const bulletIdFirst = trimmed.match(
    /^[-*]\s+([a-z][a-z0-9_:-]{2,})\s*[:：]\s*(.+)$/iu,
  );
  if (bulletIdFirst && isLegacyAssetIdForKind(bulletIdFirst[1], kind)) {
    return { id: bulletIdFirst[1], name: bulletIdFirst[2] };
  }

  const trailingParen = trimmed.match(/^(.*?)\s*[\(（]([a-z][a-z0-9_:-]{2,})[\)）]\s*$/iu);
  if (trailingParen && isAssetIdForKind(trailingParen[2], kind)) {
    return { id: trailingParen[2], name: trailingParen[1] };
  }

  const headingRawId = trimmed.match(/^([a-z][a-z0-9_:-]{2,})\b/iu)?.[1] ?? null;
  if (headingRawId && isLegacyAssetIdForKind(headingRawId, kind)) {
    return { id: headingRawId, name: trimmed };
  }

  return allowNameOnly ? { id: null, name: trimmed } : null;
}

function parseListAssetEntity(
  lines: string[],
  index: number,
  kind: AssetEntity["kind"],
): { id: string; name: string } | null {
  const line = lines[index].trim();
  const idLine = line.match(
    /^[-*]\s+(?:\*\*)?id(?:\*\*)?\s*[:：]\s*`?([a-z][a-z0-9_:-]{2,})`?\s*$/iu,
  );
  if (!idLine || !isAssetIdForKind(idLine[1], kind)) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    const trimmed = candidate.trim();

    if (!trimmed) {
      continue;
    }

    if (/^#{1,6}\s+/u.test(trimmed) || /^[-*]\s+/.test(trimmed)) {
      break;
    }

    const nameField = trimmed.match(
      /^(?:\*\*)?(?:name|title|名称|名字|事件|钩子|hook|event)(?:\*\*)?\s*[:：]\s*(.+)$/iu,
    );
    if (nameField) {
      return { id: idLine[1], name: nameField[1] };
    }
  }

  return { id: idLine[1], name: idLine[1] };
}

function findAssetIdField(
  lines: string[],
  startIndex: number,
  kind: AssetEntity["kind"],
): string | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      continue;
    }

    if (/^#{1,6}\s+/u.test(line)) {
      return null;
    }

    const idField = line.match(
      /^(?:[-*]\s*)?(?:\*\*)?id(?:\*\*)?\s*[:：]\s*`?([a-z][a-z0-9_:-]{2,})`?\s*$/iu,
    );
    if (idField && isAssetIdForKind(idField[1], kind)) {
      return idField[1];
    }
  }

  return null;
}

function cleanAssetName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/^[#*\-\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericAssetHeading(value: string): boolean {
  return /^(人物档案|次要人物|时间线|历史事件|故事时间线|待填充时间节点|世界观设定|时代背景|城市地理|技术特征|社会环境|悬念钩子|role|traits|current_state|basic|notes?|hooks?|unresolved|pending|confirmed canon|characters?|timeline|world|style)$/i.test(
    value,
  );
}
