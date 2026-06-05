export type CanonConflict = {
  canon_id: string | null;
  source: string;
  statement: string;
  user_request: string;
  matched_terms: string[];
};

type CanonRule = {
  id: string | null;
  statement: string;
  terms: string[];
};

export function detectCanonConflicts(contextData: unknown, task: string): CanonConflict[] {
  const confirmed = readNestedRecord(contextData, ["canon", "confirmed"]);
  const text = typeof confirmed?.text === "string" ? confirmed.text : "";
  const source = typeof confirmed?.path === "string" ? confirmed.path : "bible/canon.md";
  const rules = confirmedCanonRules(text);
  const conflicts: CanonConflict[] = [];

  for (const rule of rules) {
    const matchedTerms = rule.terms.filter((term) => task.includes(term));
    if (matchedTerms.length === 0) {
      continue;
    }

    conflicts.push({
      canon_id: rule.id,
      source,
      statement: rule.statement,
      user_request: task,
      matched_terms: matchedTerms,
    });
  }

  return conflicts;
}

function confirmedCanonRules(text: string): CanonRule[] {
  const rules = [];
  let currentId: string | null = null;
  let pendingRule: CanonRule | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingId = line.match(/^#+\s+([a-z0-9_]+)\b/i)?.[1] ?? null;
    if (headingId) {
      currentId = headingId;
    }

    const explicitTerms = explicitConflictTerms(line);
    if (explicitTerms.length > 0 && pendingRule) {
      pendingRule.terms = uniqueTerms([...pendingRule.terms, ...explicitTerms]);
      continue;
    }

    if (!isConstraintLine(line)) {
      continue;
    }

    const rule = {
      id: currentId,
      statement: line.replace(/^[-*0-9.\s]+/, "").trim(),
      terms: uniqueTerms([...explicitTerms, ...constraintLineTerms(line)]),
    };

    if (rule.terms.length === 0) {
      pendingRule = rule;
      rules.push(rule);
      continue;
    }

    pendingRule = rule;
    rules.push(rule);
  }

  return rules.filter((rule) => rule.terms.length > 0);
}

function isConstraintLine(line: string): boolean {
  return /禁忌|禁止|不能|不可|绝不可|不得|规则|avoid|must not|forbid/i.test(line);
}

function explicitConflictTerms(line: string): string[] {
  const match = line.match(/^(?:terms|关键词|冲突词)\s*[：:]\s*(.+)$/iu);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/[,，、]/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function constraintLineTerms(line: string): string[] {
  const terms = new Set<string>();
  const normalized = line.toLowerCase();
  const domainTerms = [
    "通灵",
    "预知",
    "超自然",
    "鬼魂",
    "灵异",
    "客轮",
    "电子密钥",
    "电子钥匙",
    "尖叫",
    "无助",
    "机械一窍不通",
  ];

  for (const term of domainTerms) {
    if (normalized.includes(term.toLowerCase())) {
      terms.add(term);
    }
  }

  return [...terms];
}

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readNestedRecord(
  value: unknown,
  pathParts: string[],
): Record<string, unknown> | null {
  let current = value;

  for (const part of pathParts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "object" && current !== null
    ? (current as Record<string, unknown>)
    : null;
}
