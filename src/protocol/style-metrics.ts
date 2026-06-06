import type { StyleMetrics } from "./model.js";

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

function countPatternHits(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}
