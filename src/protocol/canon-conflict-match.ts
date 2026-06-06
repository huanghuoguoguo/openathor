import type { CanonRule } from "./canon-conflict-rules.js";

export function matchingCanonConflictTerms(rule: CanonRule, task: string): string[] {
  const normalizedTask = task.toLowerCase();

  return rule.terms.filter((term) => normalizedTask.includes(term.toLowerCase()));
}
