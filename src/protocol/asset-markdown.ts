import { isAssetIdForKind, isLegacyAssetIdForKind } from "./asset-ids.js";
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

function extractAssetProfileFields(
  lines: string[],
  startIndex: number,
  kind: AssetEntity["kind"],
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (let cursor = startIndex + 1; cursor < lines.length; cursor += 1) {
    const raw = lines[cursor];
    const trimmed = raw.trim();

    if (!trimmed) {
      continue;
    }

    if (/^#{1,6}\s+/u.test(trimmed)) {
      break;
    }

    if (/^[-*]\s+(?:\*\*)?id(?:\*\*)?\s*[:：]/iu.test(trimmed)) {
      break;
    }

    const field = trimmed.match(
      /^(?:[-*]\s*)?(?:\*\*)?([A-Za-z_ -]+|[\p{Script=Han}]{1,8})(?:\*\*)?\s*[:：]\s*(.+)$/u,
    );

    if (!field) {
      continue;
    }

    const key = normalizeAssetProfileFieldKey(field[1]);
    if (!key || !isProfileFieldForKind(key, kind)) {
      continue;
    }

    const value = field[2]
      .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
      .trim();

    if (!value) {
      continue;
    }

    fields[key] = [...(fields[key] ?? []), value];
  }

  return fields;
}

function normalizeAssetProfileFieldKey(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    role: "role",
    identity: "role",
    身份: "role",
    职业: "role",
    traits: "traits",
    trait: "traits",
    性格: "traits",
    性格特征: "traits",
    personality: "traits",
    current_state: "current_state",
    state: "current_state",
    状态: "current_state",
    当前状态: "current_state",
    notes: "notes",
    note: "notes",
    备注: "notes",
    背景: "background",
    background: "background",
    backstory: "background",
    秘密: "secret",
    secret: "secret",
    appearance: "appearance",
    外貌: "appearance",
    summary: "summary",
    描述: "summary",
    影响: "impact",
    status: "status",
    悬而未决: "open_question",
    关联: "relation",
  };

  return aliases[normalized] ?? null;
}

function isProfileFieldForKind(key: string, kind: AssetEntity["kind"]): boolean {
  if (kind === "character") {
    return [
      "role",
      "traits",
      "current_state",
      "notes",
      "background",
      "secret",
      "appearance",
    ].includes(key);
  }

  if (kind === "timeline_event") {
    return ["summary", "notes", "impact"].includes(key);
  }

  if (kind === "hook") {
    return ["summary", "status", "notes", "open_question", "relation"].includes(key);
  }

  return ["summary", "notes"].includes(key);
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
