import { OpenAthorError } from "./errors.js";
import { ensureSafeRelativePath, toPosix } from "./paths.js";
import { STYLE_RULE_STOP_WORDS, snippetAround } from "./text-analysis.js";
import { uniqueLimited } from "./value.js";
import type { StyleMetrics } from "./model.js";

export function normalizeStyleReferencePath(relPath: string | undefined): string {
  if (!relPath?.trim()) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_REQUIRED",
      "openathor style analyze requires a reference path.",
      { exitCode: 2 },
    );
  }

  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "reference path");

  return safeRelPath;
}

export function normalizeStyleProfileId(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (!/^[a-z][a-z0-9_-]{2,}$/i.test(candidate)) {
    throw new OpenAthorError(
      "OA_STYLE_PROFILE_INVALID",
      "Style profile id must start with a letter and contain only letters, numbers, underscores or dashes.",
      { exitCode: 2 },
    );
  }

  return candidate;
}

export function normalizeStylePermission(value: string | undefined): string {
  const permission = value?.trim() || "user_owned_or_authorized";
  const allowed = new Set([
    "user_owned_or_authorized",
    "user_owned",
    "licensed",
    "public_domain",
    "unknown",
  ]);

  if (!allowed.has(permission)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_PERMISSION_INVALID",
      `Unsupported style reference permission ${permission}.`,
      {
        exitCode: 2,
        hints: ["Use user_owned_or_authorized, user_owned, licensed, public_domain, or unknown."],
      },
    );
  }

  return permission;
}

export function normalizeStyleSourceType(value: string | undefined): string {
  const sourceType = value?.trim() || "user_provided";
  const allowed = new Set(["user_provided", "project_manuscript", "licensed_reference", "public_domain"]);

  if (!allowed.has(sourceType)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_SOURCE_INVALID",
      `Unsupported style reference source type ${sourceType}.`,
      {
        exitCode: 2,
        hints: ["Use user_provided, project_manuscript, licensed_reference, or public_domain."],
      },
    );
  }

  return sourceType;
}

export function buildStyleProfile(
  id: string,
  name: string,
  referenceId: string,
  metrics: StyleMetrics,
): Record<string, unknown> {
  const traits = {
    sentence_length: metricBand(metrics.average_sentence_chars, 28, 55),
    paragraph_length: metricBand(metrics.average_paragraph_chars, 80, 180),
    dialogue_ratio: ratioBand(metrics.dialogue_ratio, 0.12, 0.32),
    pacing:
      metrics.average_sentence_chars <= 28 && metrics.average_paragraph_chars <= 120
        ? "brisk"
        : metrics.average_sentence_chars >= 55 || metrics.average_paragraph_chars >= 220
          ? "expansive"
          : "measured",
    imagery_density: metricBand(
      metrics.char_count > 0 ? (metrics.action_detail_hits * 1000) / metrics.char_count : 0,
      4,
      11,
    ),
    exposition_style:
      metrics.emotion_exposition_hits > metrics.action_detail_hits
        ? "explicit_emotion"
        : metrics.action_detail_hits > metrics.emotion_exposition_hits * 2
          ? "concrete_detail"
          : "balanced",
  };

  return {
    id,
    name,
    status: "pending",
    source: "user_reference",
    references: [referenceId],
    generated_by: "openathor_style_analyze",
    method: "deterministic_style_metric_scan",
    traits,
    metrics,
    do: styleAnalyzeDoRules(metrics),
    avoid: [
      "不要复制参考文本原句或专有表达",
      "不要把参考文本作者姓名当作可执行风格规则",
      "不要把 pending profile 当作 confirmed project style",
    ],
  };
}

export function styleMetrics(text: string): StyleMetrics {
  const body = text.replace(/^# .+$/gm, "").trim();
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const sentences = body
    .split(/[。！？!?]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const dialogueLines = lines.filter((line) => /^["“][^"”]+["”]/u.test(line));
  const charCount = [...body.replace(/\s+/g, "")].length;
  const paragraphChars = paragraphs.map((paragraph) => [...paragraph.replace(/\s+/g, "")].length);

  return {
    char_count: charCount,
    sentence_count: sentences.length,
    average_sentence_chars:
      sentences.length > 0 ? roundOne(charCount / sentences.length) : 0,
    dialogue_line_count: dialogueLines.length,
    dialogue_ratio: lines.length > 0 ? roundTwo(dialogueLines.length / lines.length) : 0,
    paragraph_count: paragraphs.length,
    average_paragraph_chars:
      paragraphChars.length > 0
        ? roundOne(paragraphChars.reduce((sum, value) => sum + value, 0) / paragraphChars.length)
        : 0,
    action_detail_hits: countPatternHits(
      body,
      /手套|证物袋|相机|放大镜|镊子|齿轮|钥匙|锁|金属|锈|雨|雾|光|声|触|记录|笔记|机械/g,
    ),
    emotion_exposition_hits: countPatternHits(
      body,
      /悲伤|痛苦|愤怒|害怕|恐惧|绝望|崩溃|激动|兴奋|开心|难过|内心|情绪/g,
    ),
  };
}

export function extractStyleRules(text: string): {
  do: string[];
  avoid: string[];
} {
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
  rules: {
    do: string[];
    avoid: string[];
  },
  maxChars: number,
): {
  do_hits: Array<{ rule: string; matched_terms: string[]; snippet: string }>;
  avoid_hits: Array<{ rule: string; matched_terms: string[]; snippet: string }>;
  do_misses: string[];
} {
  return {
    do_hits: styleRuleHits(text, rules.do, maxChars),
    avoid_hits: styleRuleHits(text, rules.avoid, maxChars),
    do_misses: rules.do
      .filter((rule) => !styleRuleHasHit(text, rule))
      .slice(0, 10),
  };
}

export function styleDriftFindings(
  target: StyleMetrics,
  baseline: StyleMetrics | null,
  ruleMatches: ReturnType<typeof styleRuleMatches>,
): Array<{
  code: string;
  severity: "low" | "medium";
  message: string;
  evidence: Record<string, unknown>;
}> {
  const findings = [];

  if (baseline && baseline.average_sentence_chars > 0) {
    const ratio = target.average_sentence_chars / baseline.average_sentence_chars;
    if (ratio >= 1.8 || ratio <= 0.45) {
      findings.push({
        code: "style_sentence_length_shift",
        severity: "medium" as const,
        message: "Average sentence length differs sharply from the project baseline.",
        evidence: {
          target_average_sentence_chars: target.average_sentence_chars,
          baseline_average_sentence_chars: baseline.average_sentence_chars,
        },
      });
    } else if (ratio >= 1.45 || ratio <= 0.65) {
      findings.push({
        code: "style_sentence_length_review",
        severity: "low" as const,
        message: "Average sentence length differs from the project baseline.",
        evidence: {
          target_average_sentence_chars: target.average_sentence_chars,
          baseline_average_sentence_chars: baseline.average_sentence_chars,
        },
      });
    }
  }

  if (baseline && Math.abs(target.dialogue_ratio - baseline.dialogue_ratio) >= 0.35) {
    findings.push({
      code: "style_dialogue_ratio_shift",
      severity: "low" as const,
      message: "Dialogue line ratio differs from the project baseline.",
      evidence: {
        target_dialogue_ratio: target.dialogue_ratio,
        baseline_dialogue_ratio: baseline.dialogue_ratio,
      },
    });
  }

  if (target.emotion_exposition_hits > target.action_detail_hits && target.char_count > 200) {
    findings.push({
      code: "style_emotion_exposition_review",
      severity: "low" as const,
      message: "Emotion exposition terms outnumber concrete action/detail terms.",
      evidence: {
        emotion_exposition_hits: target.emotion_exposition_hits,
        action_detail_hits: target.action_detail_hits,
      },
    });
  }

  if (ruleMatches.avoid_hits.length > 0) {
    findings.push({
      code: "style_avoid_rule_hit",
      severity: "medium" as const,
      message: "The target chapter matches avoid-rule terms from project style guidance.",
      evidence: {
        avoid_hit_count: ruleMatches.avoid_hits.length,
        rules: ruleMatches.avoid_hits.slice(0, 5).map((hit) => hit.rule),
      },
    });
  }

  return findings;
}

function metricBand(value: number, lowMax: number, highMin: number): "low" | "medium" | "high" {
  if (value <= lowMax) {
    return "low";
  }
  if (value >= highMin) {
    return "high";
  }
  return "medium";
}

function ratioBand(value: number, lowMax: number, highMin: number): "low" | "medium" | "high" {
  if (value <= lowMax) {
    return "low";
  }
  if (value >= highMin) {
    return "high";
  }
  return "medium";
}

function styleAnalyzeDoRules(metrics: StyleMetrics): string[] {
  const rules = [];

  if (metrics.average_sentence_chars <= 28) {
    rules.push("保持短句和直接动作推进");
  } else if (metrics.average_sentence_chars >= 55) {
    rules.push("允许较长句承载观察和转折");
  } else {
    rules.push("保持中等句长和清晰节奏");
  }

  if (metrics.dialogue_ratio >= 0.32) {
    rules.push("保留对话推动信息变化");
  } else if (metrics.dialogue_ratio <= 0.12) {
    rules.push("优先使用叙述和场景动作推进");
  } else {
    rules.push("保持叙述与对话的均衡");
  }

  if (metrics.action_detail_hits >= metrics.emotion_exposition_hits) {
    rules.push("用动作、物件和场景细节承载情绪");
  } else {
    rules.push("控制直接情绪解释，保留必要心理说明");
  }

  return rules;
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
): Array<{ rule: string; matched_terms: string[]; snippet: string }> {
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

function countPatternHits(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}
