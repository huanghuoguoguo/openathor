import path from "node:path";
import { buildAssetAuditResult } from "./asset-audit.js";
import { readAssetAuditSources } from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import { findProjectRoot } from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import type {
  AssetsAuditOptions,
  CommandResult,
} from "./model.js";

export async function runAssetsAudit(
  options: AssetsAuditOptions = {},
): Promise<CommandResult> {
  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const assetFiles = await readAssetAuditSources(projectRoot, sourceMap);
  const audit = await buildAssetAuditResult({
    projectRoot,
    inspection,
    assetFiles,
    maxChars,
  });

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings: audit.warnings,
    data: audit.data,
  };
}
