const CONSTRAINT_MARKER_RE =
  /禁忌|禁止|不能|不可|绝不可|不得|规则|avoid|must not|forbid/iu;
const EXPLICIT_TERMS_RE = /^(?:terms|关键词|冲突词)\s*[：:]\s*(.+)$/iu;
const FRONTMATTER_PREFIX_RE = /^[-*0-9.\s]*(?:statement|rule|规则|约束)\s*[：:]\s*/iu;
const MARKDOWN_PREFIX_RE = /^[-*0-9.\s]+/u;

const CONSTRAINT_CLAUSE_RE =
  /(?:禁忌|禁止|不能|不可|绝不可|不得|avoid|must not|forbid)([^。；;.!?！？]*)/giu;
const FORBIDDEN_OBJECT_PREFIX_RE =
  /^.*(?:进行|通过|依靠|使用|利用|改成|写成|变成|成为|描写为|靠|为)/u;
const LEADING_NOISE_RE = /^(?:无解释|直接|突然|可以|能够|让|使|把|将|靠|依靠|通过|进行|使用|利用)+/u;
const TRAILING_NOISE_RE = /(?:取证|破案|解释|描写|写作|叙事|发生)$/u;
const FORBIDDEN_TERM_SPLIT_RE = /[,，、；;：:\s]+|(?:或|和|与|及|并且|并|且)/u;
const NOISE_TERM_RE =
  /^(?:status|type|source|source_ref|statement|confirmed|character_rule|无解释|直接|突然)$/iu;

export function isCanonConstraintLine(line: string): boolean {
  return CONSTRAINT_MARKER_RE.test(line);
}

export function explicitCanonConflictTerms(line: string): string[] {
  const match = normalizeCanonLine(line).match(EXPLICIT_TERMS_RE);
  if (!match) {
    return [];
  }

  return uniqueCanonConflictTerms(match[1].split(/[,，、]/u));
}

export function canonConstraintTerms(line: string): string[] {
  const terms = new Set<string>();
  const clauses = constraintClauses(normalizeCanonLine(line));

  for (const clause of clauses) {
    for (const term of quotedTerms(clause)) {
      terms.add(term);
    }
    for (const term of forbiddenObjectTerms(clause)) {
      terms.add(term);
    }
  }

  return uniqueCanonConflictTerms([...terms]);
}

export function uniqueCanonConflictTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const value = rawValue.trim();
    const key = value.toLowerCase();
    if (!value || value.length < 2 || seen.has(key) || NOISE_TERM_RE.test(value)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeCanonLine(line: string): string {
  return line.replace(FRONTMATTER_PREFIX_RE, "").replace(MARKDOWN_PREFIX_RE, "").trim();
}

function quotedTerms(text: string): string[] {
  const terms: string[] = [];
  const quotedTermRe = /[《「『“"]([^》」』”"]{2,})[》」』”"]/gu;
  let match = quotedTermRe.exec(text);

  while (match) {
    terms.push(match[1].trim());
    match = quotedTermRe.exec(text);
  }

  return terms;
}

function constraintClauses(text: string): string[] {
  const clauses: string[] = [];
  CONSTRAINT_CLAUSE_RE.lastIndex = 0;
  let match = CONSTRAINT_CLAUSE_RE.exec(text);

  while (match) {
    clauses.push(match[1].trim());
    match = CONSTRAINT_CLAUSE_RE.exec(text);
  }

  return clauses;
}

function forbiddenObjectTerms(clause: string): string[] {
  const objectText = clause.replace(FORBIDDEN_OBJECT_PREFIX_RE, "");
  const terms: string[] = [];

  for (const rawTerm of objectText.split(FORBIDDEN_TERM_SPLIT_RE)) {
    const term = rawTerm
      .replace(LEADING_NOISE_RE, "")
      .replace(TRAILING_NOISE_RE, "")
      .trim();
    if (term.length >= 2) {
      terms.push(term);
    }
  }

  return terms;
}
