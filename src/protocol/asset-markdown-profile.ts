import type { AssetEntity } from "./model.js";

export function extractAssetProfileFields(
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
