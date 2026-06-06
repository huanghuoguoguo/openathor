import {
  canonConstraintTerms,
  explicitCanonConflictTerms,
  isCanonConstraintLine,
  uniqueCanonConflictTerms,
} from "./canon-conflict-terms.js";

export type CanonRule = {
  id: string | null;
  statement: string;
  terms: string[];
};

export function confirmedCanonRules(text: string): CanonRule[] {
  const rules: CanonRule[] = [];
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

    const explicitTerms = explicitCanonConflictTerms(line);
    if (explicitTerms.length > 0 && pendingRule) {
      pendingRule.terms = uniqueCanonConflictTerms([...pendingRule.terms, ...explicitTerms]);
      continue;
    }

    if (!isCanonConstraintLine(line)) {
      continue;
    }

    pendingRule = {
      id: currentId,
      statement: cleanCanonStatement(line),
      terms: uniqueCanonConflictTerms([...explicitTerms, ...canonConstraintTerms(line)]),
    };
    rules.push(pendingRule);
  }

  return rules.filter((rule) => rule.terms.length > 0);
}

function cleanCanonStatement(line: string): string {
  return line
    .replace(/^[-*0-9.\s]*(?:statement|rule|规则|约束)\s*[：:]\s*/iu, "")
    .replace(/^[-*0-9.\s]+/u, "")
    .trim();
}
