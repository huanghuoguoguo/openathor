export function upsertAssetSyncBlocks<T>(
  currentText: string,
  items: T[],
  sectionTitle: string,
  idOf: (item: T) => string,
  markdownFor: (items: T[]) => string,
): string {
  const text = currentText.endsWith("\n") ? currentText : `${currentText}\n`;
  let nextText = text;
  const appendItems = [];

  for (const item of items) {
    const block = assetSyncItemBlocksMarkdown(markdownFor([item]), sectionTitle);
    const replaced = replaceAssetSyncBlock(nextText, idOf(item), block);

    if (replaced === null) {
      appendItems.push(item);
      continue;
    }

    nextText = replaced;
  }

  if (appendItems.length === 0) {
    return nextText;
  }

  return `${nextText.trimEnd()}${markdownForSection(sectionTitle, appendItems, markdownFor)}\n`;
}

function assetSyncItemBlocksMarkdown(sectionMarkdown: string, sectionTitle: string): string {
  const lines = sectionMarkdown.trim().split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(sectionTitle)}\\s*$`, "iu");
  const firstContentIndex = lines.findIndex((line, index) => {
    if (index === 0 && headingPattern.test(line.trim())) {
      return false;
    }
    return line.trim().length > 0;
  });

  return lines.slice(Math.max(firstContentIndex, 0)).join("\n").trim();
}

function markdownForSection<T>(
  sectionTitle: string,
  items: T[],
  markdownFor: (items: T[]) => string,
): string {
  const rendered = markdownFor(items).trim();
  return rendered.startsWith(`## ${sectionTitle}`) ? `\n\n${rendered}` : `\n\n## ${sectionTitle}\n\n${rendered}`;
}

function replaceAssetSyncBlock(text: string, id: string, replacementBlock: string): string | null {
  const lines = text.split(/\r?\n/);
  const idLinePattern = new RegExp(
    `^[-*]\\s+(?:\\*\\*)?id(?:\\*\\*)?\\s*[:：]\\s*\\x60?${escapeRegExp(id)}\\x60?\\s*$`,
    "iu",
  );
  const start = lines.findIndex((line) =>
    idLinePattern.test(line.trim()),
  );

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const trimmed = lines[cursor].trim();
    if (/^#{1,6}\s+/u.test(trimmed) || /^[-*]\s+(?:\*\*)?id(?:\*\*)?\s*[:：]/iu.test(trimmed)) {
      end = cursor;
      break;
    }
  }

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const replacement = replacementBlock.split(/\r?\n/);
  if (after[0]?.trim() && !/^#{1,6}\s+/u.test(after[0].trim())) {
    replacement.push("");
  }

  return [...before, ...replacement, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
