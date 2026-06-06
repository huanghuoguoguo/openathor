import path from "node:path";
import { sha256File } from "../protocol/paths.js";

export async function resolveFixtureHash(cwd: string, value: string): Promise<string> {
  if (!value.startsWith("current:")) {
    const separator = value.indexOf("=current:");
    if (separator > 0) {
      const relPath = value.slice(separator + "=current:".length);
      return `${value.slice(0, separator)}=${await sha256File(path.join(cwd, relPath))}`;
    }

    return value;
  }

  const relPath = value.slice("current:".length);
  return sha256File(path.join(cwd, relPath));
}
