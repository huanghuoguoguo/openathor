export function firstMarkdownHeading(text: string): string | null {
  const heading = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  return heading ? heading.replace(/^#\s+/, "").trim() || null : null;
}

export function titleFromText(text: string): string | null {
  const heading = firstMarkdownHeading(text);
  if (heading) {
    return chapterLineTitle(heading) ?? heading;
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ? chapterLineTitle(firstLine) : null;
}

export function titleFromTask(task: string): string | null {
  const bookTitle = task.match(/《([^》]+)》/u)?.[1]?.trim();
  if (bookTitle) {
    return bookTitle;
  }

  const quotedTitle = task.match(/["“”]([^"“”]+)["“”]/u)?.[1]?.trim();
  if (quotedTitle) {
    return quotedTitle;
  }

  const chapterTitle = task.match(
    /(?:^|[\s，,。；;])(?:第[零〇一二三四五六七八九十百千万两\d]+[章节回部卷幕集]|chapter\s*\d+)\s*[：:]\s*([^，,。；;\n\r]+)/iu,
  )?.[1]?.trim();
  return chapterTitle || null;
}

function chapterLineTitle(line: string): string | null {
  const marker = String.raw`(?:第[零〇一二三四五六七八九十百千万两\d]+[章节回部卷幕集]|chapter\s*\d+)`;
  const titled = line.match(new RegExp(`^${marker}(?:\\s*[：:-]\\s*|\\s+)(.+)$`, "iu"));
  const title = titled?.[1]?.trim();

  if (title) {
    return title;
  }

  return line.match(new RegExp(`^${marker}$`, "iu")) ? line : null;
}
