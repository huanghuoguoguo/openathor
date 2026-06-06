import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveContextChapter } from "./chapter-target.js";
import { readContextSource } from "./context-sources.js";
import type { EnvelopeSource } from "./envelope.js";
import { OpenAthorError } from "./errors.js";
import { findProjectRoot } from "./project-files.js";
import { inspectProject } from "./project-inspection.js";
import {
  styleDriftFindings,
  styleMetrics,
  styleRuleMatches,
} from "./style-analysis.js";
import { buildStyleGuidance } from "./style-guidance.js";
import { normalizeSnippetChars } from "./text-analysis.js";
import type {
  CommandResult,
  StyleCheckOptions,
} from "./model.js";

export async function runStyleCheck(
  options: StyleCheckOptions = {},
): Promise<CommandResult> {
  if ((options.scope ?? "chapter") !== "chapter") {
    throw new OpenAthorError(
      "OA_STYLE_UNSUPPORTED_SCOPE",
      `Unsupported style check scope ${options.scope}.`,
      { exitCode: 2 },
    );
  }

  const projectRoot = await findProjectRoot(path.resolve(options.cwd ?? process.cwd()));
  const inspection = await inspectProject(projectRoot, { includeIndexWarning: true });
  const targetChapter = resolveContextChapter(
    options.target,
    inspection.chapters,
    inspection.manuscriptIndex,
  );
  const maxChars = normalizeSnippetChars(options.maxChars);
  const sourceMap = new Map<string, EnvelopeSource>();

  for (const source of inspection.sources) {
    sourceMap.set(source.path, source);
  }

  const styleSource = await readContextSource(
    projectRoot,
    "bible/style.md",
    Number.MAX_SAFE_INTEGER,
    sourceMap,
  );
  const profileSource = await readContextSource(
    projectRoot,
    "style/profiles.yaml",
    Number.MAX_SAFE_INTEGER,
    sourceMap,
  );
  const referenceSource = await readContextSource(
    projectRoot,
    "style/references.yaml",
    Number.MAX_SAFE_INTEGER,
    sourceMap,
  );
  const chapterText = await readFile(path.join(projectRoot, targetChapter.source_path), "utf8");
  sourceMap.set(targetChapter.source_path, {
    path: targetChapter.source_path,
    hash: targetChapter.content_hash,
  });
  const baselineChapters = inspection.manuscriptIndex.chapters.filter(
    (chapter) => chapter.id !== targetChapter.id && chapter.status !== "archived",
  );
  const baselineTexts = [];

  for (const chapter of baselineChapters) {
    const text = await readFile(path.join(projectRoot, chapter.source_path), "utf8");
    sourceMap.set(chapter.source_path, {
      path: chapter.source_path,
      hash: chapter.content_hash,
    });
    baselineTexts.push(text);
  }

  const targetMetrics = styleMetrics(chapterText);
  const baselineMetrics =
    baselineTexts.length > 0 ? styleMetrics(baselineTexts.join("\n\n")) : null;
  const styleGuidance = buildStyleGuidance({
    manualStyle: styleSource,
    profiles: profileSource,
    references: referenceSource,
  });
  const styleRules = styleGuidance.rules;
  const ruleMatches = styleRuleMatches(chapterText, styleRules, maxChars);
  const driftFindings = styleDriftFindings(targetMetrics, baselineMetrics, ruleMatches);
  const warnings = [...inspection.warnings];

  if (driftFindings.some((finding) => finding.severity === "medium")) {
    warnings.push({
      code: "OA_STYLE_DRIFT_CANDIDATE",
      message: "The target chapter has deterministic style drift candidate(s).",
      severity: "medium",
    });
  } else if (driftFindings.some((finding) => finding.severity === "low")) {
    warnings.push({
      code: "OA_STYLE_REVIEW_CANDIDATE",
      message: "The target chapter has low-severity style review candidate(s).",
      severity: "low",
    });
  }

  return {
    projectRoot,
    projectId: inspection.config.project.id,
    sources: [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    writes: [],
    warnings,
    data: {
      scope: "chapter",
      target: {
        id: targetChapter.id,
        display_order: targetChapter.display_order,
        title: targetChapter.title,
        source_path: targetChapter.source_path,
        content_hash: targetChapter.content_hash,
      },
      method: "deterministic_style_metric_scan",
      read_only: true,
      style_sources: {
        manual_style: {
          path: styleSource.path,
          hash: styleSource.hash,
          present: styleSource.hash !== null,
        },
        profiles: {
          path: profileSource.path,
          hash: profileSource.hash,
          present: profileSource.hash !== null,
        },
        references: {
          path: referenceSource.path,
          hash: referenceSource.hash,
          present: referenceSource.hash !== null,
        },
      },
      style_guidance: styleGuidance,
      metrics: {
        target: targetMetrics,
        baseline: baselineMetrics,
      },
      rules: {
        do: styleRules.do,
        avoid: styleRules.avoid,
      },
      rule_matches: ruleMatches,
      findings: driftFindings,
      verdict:
        driftFindings.length === 0
          ? "pass"
          : driftFindings.some((finding) => finding.severity === "medium")
            ? "needs_revision"
            : "needs_review",
      recommendations: [
        "Treat deterministic style findings as review prompts, not automatic rewrite instructions.",
        "Use openathor style revise chapter <target> --goal ... for " +
          "style-specific proposal, diff, and hash-confirm workflow.",
        "Do not copy reference text phrasing when resolving style drift.",
      ],
    },
  };
}
