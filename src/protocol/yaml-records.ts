import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { pathExists } from "./project-files.js";
import { isPlainRecord } from "./value.js";

export async function readYamlObjectFile(
  filePath: string,
  fallback: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) {
    return fallback;
  }

  const parsed = parseYaml(await readFile(filePath, "utf8"));
  return isPlainRecord(parsed) ? parsed : fallback;
}

export function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

export function replaceRecordById(
  records: Array<Record<string, unknown>>,
  next: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const id = typeof next.id === "string" ? next.id : null;
  const filtered = id ? records.filter((record) => record.id !== id) : records;
  return [...filtered, next];
}
