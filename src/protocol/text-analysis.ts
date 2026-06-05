import { createHash } from "node:crypto";

export const VECTOR_DIMENSIONS = 64;

export const SEARCH_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "一个",
  "没有",
  "这里",
  "那里",
  "他们",
  "她们",
  "我们",
  "你们",
  "正在",
]);

export const ASSET_PROFILE_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  "身份",
  "背景",
  "外貌",
  "性格",
  "秘密",
  "状态",
  "当前",
  "当前状态",
  "角色",
  "人物",
  "主角",
  "配角",
  "已经",
  "仍然",
  "没有",
  "但是",
  "为了",
  "因为",
  "可能",
  "某种",
  "某个",
]);

export const STYLE_RULE_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  "使用",
  "保持",
  "避免",
  "不要",
  "可以",
  "作为",
  "通过",
  "体现",
  "描写",
  "语言",
  "特征",
  "特点",
  "叙事",
  "风格",
  "项目",
]);

export function findTextMatches(
  text: string,
  query: string,
  maxChars: number,
): Array<{
  line: number;
  column: number;
  snippet: string;
}> {
  const lowerQuery = query.toLowerCase();
  const matches = [];
  let offset = 0;

  for (const lineText of text.split(/\r?\n/)) {
    const index = lineText.toLowerCase().indexOf(lowerQuery);
    if (index >= 0) {
      matches.push({
        line: offset + 1,
        column: index + 1,
        snippet: snippetAround(lineText, index, query.length, maxChars),
      });
    }

    offset += 1;
  }

  return matches;
}

export function extractSearchTerms(text: string): string[] {
  const terms = new Map<string, number>();
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9_]{3,}/g) ?? [];
  const cjk = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];

  for (const token of [...latin, ...cjk.flatMap(cjkNgrams)]) {
    if (SEARCH_STOP_WORDS.has(token)) {
      continue;
    }

    terms.set(token, (terms.get(token) ?? 0) + 1);
  }

  return [...terms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, 80)
    .map(([term]) => term);
}

export function cjkNgrams(value: string): string[] {
  const result = new Set<string>();
  const chars = [...value];

  for (let size = 2; size <= Math.min(4, chars.length); size += 1) {
    for (let index = 0; index <= chars.length - size; index += 1) {
      result.add(chars.slice(index, index + size).join(""));
    }
  }

  return [...result];
}

export function relatedScore(
  text: string,
  targetTerms: string[],
  maxChars: number,
): {
  score: number;
  sharedTerms: string[];
  snippet: string;
} {
  const normalized = text.toLowerCase();
  const sharedTerms = targetTerms.filter((term) => normalized.includes(term)).slice(0, 12);

  if (sharedTerms.length === 0) {
    return {
      score: 0,
      sharedTerms: [],
      snippet: "",
    };
  }

  const firstTerm = sharedTerms[0];
  const index = normalized.indexOf(firstTerm);

  return {
    score: sharedTerms.length,
    sharedTerms,
    snippet: snippetAround(text.replace(/\s+/g, " "), Math.max(0, index), firstTerm.length, maxChars),
  };
}

export function deterministicEmbedding(terms: string[]): number[] {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);

  for (const term of terms) {
    const hash = createHash("sha256").update(term).digest();
    const index = hash[0] % VECTOR_DIMENSIONS;
    const sign = hash[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }

  return Number(Math.max(0, dot).toFixed(6));
}

export function snippetAround(
  lineText: string,
  index: number,
  queryLength: number,
  maxChars: number,
): string {
  if (lineText.length <= maxChars) {
    return lineText;
  }

  const half = Math.floor((maxChars - queryLength) / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(lineText.length, start + maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < lineText.length ? "..." : "";
  return `${prefix}${lineText.slice(start, end)}${suffix}`;
}

export function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit) || !limit || limit < 1) {
    return fallback;
  }

  return Math.min(Math.floor(limit), 100);
}

export function normalizeSnippetChars(maxChars: number | undefined): number {
  if (!Number.isFinite(maxChars) || !maxChars || maxChars < 40) {
    return 180;
  }

  return Math.min(Math.floor(maxChars), 1000);
}
