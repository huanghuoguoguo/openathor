import type { StyleMetrics } from "./model.js";

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
