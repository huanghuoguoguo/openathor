import { createHash } from "node:crypto";

export function stableProjectId(title: string): string {
  return slugAscii(title) || `project_${shortHash(title)}`;
}

export function slugAscii(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
