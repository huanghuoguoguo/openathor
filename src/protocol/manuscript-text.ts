export function normalizeManuscriptTextInput(text: string): {
  text: string;
  convertedEscapedNewlines: boolean;
} {
  const trimmed = text.trim();
  const hasRealNewline = /\r|\n/.test(trimmed);
  const escapedNewlineCount = (trimmed.match(/\\n|\\r\\n/g) ?? []).length;

  if (hasRealNewline || escapedNewlineCount === 0) {
    return {
      text: trimmed,
      convertedEscapedNewlines: false,
    };
  }

  return {
    text: trimmed
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r"),
    convertedEscapedNewlines: true,
  };
}
