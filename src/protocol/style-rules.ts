import { STYLE_RULE_STOP_WORDS, snippetAround } from "./text-analysis.js";
import { uniqueLimited } from "./value.js";

export type StyleRuleSet = {
  do: string[];
  avoid: string[];
};

export type StyleRuleHit = {
  rule: string;
  matched_terms: string[];
  snippet: string;
};

export type StyleRuleMatchResult = {
  do_hits: StyleRuleHit[];
  avoid_hits: StyleRuleHit[];
  do_misses: string[];
};

export function extractStyleRules(text: string): StyleRuleSet {
  const doRules = [];
  const avoidRules = [];
  let section: "do" | "avoid" | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^(###?\s*)?(do|应做|推荐|典型行为|语言特征|特点|写作风格|语言质感|物理细节优先)/i.test(line)) {
      section = "do";
      continue;
    }

    if (/^(###?\s*)?(avoid|避免|禁止|不要|禁忌|禁止元素)/i.test(line)) {
      section = "avoid";
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/u)?.[1]?.trim();
    if (!bullet || !section) {
      continue;
    }

    const cleaned = cleanStyleRule(bullet);
    if (!cleaned) {
      continue;
    }

    const bulletSection = styleRuleSectionFromBullet(bullet) ?? section;
    if (bulletSection === "do") {
      doRules.push(cleaned);
    } else {
      avoidRules.push(cleaned);
    }
  }

  return {
    do: uniqueLimited(doRules, 20),
    avoid: uniqueLimited(avoidRules, 20),
  };
}

export function styleRuleMatches(
  text: string,
  rules: StyleRuleSet,
  maxChars: number,
): StyleRuleMatchResult {
  return {
    do_hits: styleRuleHits(text, rules.do, maxChars),
    avoid_hits: styleRuleHits(text, rules.avoid, maxChars),
    do_misses: rules.do
      .filter((rule) => !styleRuleHasHit(text, rule))
      .slice(0, 10),
  };
}

function cleanStyleRule(value: string): string {
  const cleaned = value
    .replace(/^["“”']|["“”']$/g, "")
    .replace(/^[✅❌]\s*/u, "")
    .replace(/^(?:避免|禁止|不要|禁忌|avoid|must not)\s*[:：]\s*/iu, "")
    .replace(/^(?:do|应做|推荐)\s*[:：]\s*/iu, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(语言特征|典型行为|特点|感官偏好|思维模式|叙事距离|适用场景|视觉|听觉|气味|触觉|节奏)[:：]?$/u.test(cleaned)) {
    return "";
  }

  if (/^(id|name|status|source|references|profiles|traits|rules|sentence_rhythm|diction|exposition_style)[:：]/iu.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function styleRuleSectionFromBullet(value: string): "do" | "avoid" | null {
  if (/^[❌]/u.test(value) || /(?:避免|禁止|不要|禁忌|avoid|must not)/iu.test(value)) {
    return "avoid";
  }
  if (/^[✅]/u.test(value) || /(?:应做|推荐|do)\s*[:：]/iu.test(value)) {
    return "do";
  }

  return null;
}

function styleRuleHits(
  text: string,
  rules: string[],
  maxChars: number,
): StyleRuleHit[] {
  const hits = [];
  const normalized = text.toLowerCase();

  for (const rule of rules) {
    const terms = extractStyleRuleTerms(rule);
    const matchedTerms = terms.filter((term) => normalized.includes(term.toLowerCase()));
    if (matchedTerms.length === 0) {
      continue;
    }

    const firstTerm = matchedTerms[0];
    const index = Math.max(0, normalized.indexOf(firstTerm.toLowerCase()));
    hits.push({
      rule,
      matched_terms: matchedTerms.slice(0, 6),
      snippet: snippetAround(text.replace(/\s+/g, " "), index, firstTerm.length, maxChars),
    });
  }

  return hits.slice(0, 12);
}

function styleRuleHasHit(text: string, rule: string): boolean {
  const normalized = text.toLowerCase();
  return extractStyleRuleTerms(rule).some((term) =>
    normalized.includes(term.toLowerCase()),
  );
}

function extractStyleRuleTerms(rule: string): string[] {
  const terms = new Set<string>();
  const normalized = rule.toLowerCase();

  for (const token of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!STYLE_RULE_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  for (const token of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    if (!STYLE_RULE_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }

  return [...terms].slice(0, 12);
}
