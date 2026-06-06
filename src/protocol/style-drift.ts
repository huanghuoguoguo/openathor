import type { StyleMetrics } from "./model.js";
import type { StyleRuleMatchResult } from "./style-rules.js";

export type StyleDriftFinding = {
  code: string;
  severity: "low" | "medium";
  message: string;
  evidence: Record<string, unknown>;
};

export function styleDriftFindings(
  target: StyleMetrics,
  baseline: StyleMetrics | null,
  ruleMatches: StyleRuleMatchResult,
): StyleDriftFinding[] {
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
