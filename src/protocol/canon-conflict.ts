import { matchingCanonConflictTerms } from "./canon-conflict-match.js";
import { confirmedCanonRules } from "./canon-conflict-rules.js";

export type CanonConflict = {
  canon_id: string | null;
  source: string;
  statement: string;
  user_request: string;
  matched_terms: string[];
};

export function detectCanonConflicts(contextData: unknown, task: string): CanonConflict[] {
  const confirmed = readNestedRecord(contextData, ["canon", "confirmed"]);
  const text = typeof confirmed?.text === "string" ? confirmed.text : "";
  const source = typeof confirmed?.path === "string" ? confirmed.path : "bible/canon.md";
  const rules = confirmedCanonRules(text);
  const conflicts: CanonConflict[] = [];

  for (const rule of rules) {
    const matchedTerms = matchingCanonConflictTerms(rule, task);
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
