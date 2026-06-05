import { PROTOCOL_VERSION } from "./constants.js";
import type { OpenAthorError } from "./errors.js";

export type EnvelopeSource = {
  path: string;
  hash?: string;
};

export type EnvelopeWrite = {
  path: string;
  change_type: "created" | "modified" | "deleted" | "replaced";
  reason: string;
};

export type EnvelopeWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

export type OpenAthorEnvelope = {
  ok: boolean;
  command: string;
  run_id: string | null;
  protocol_version: string;
  project: {
    id: string | null;
    root: string;
  } | null;
  sources: EnvelopeSource[];
  writes: EnvelopeWrite[];
  warnings: EnvelopeWarning[];
  data: unknown;
  error?: ReturnType<OpenAthorError["toJSON"]> | null;
};

export function envelope(input: {
  ok: boolean;
  command: string;
  projectRoot?: string;
  projectId?: string | null;
  sources?: EnvelopeSource[];
  writes?: EnvelopeWrite[];
  warnings?: EnvelopeWarning[];
  data?: unknown;
  error?: ReturnType<OpenAthorError["toJSON"]> | null;
}): OpenAthorEnvelope {
  return {
    ok: input.ok,
    command: input.command,
    run_id: null,
    protocol_version: PROTOCOL_VERSION,
    project: input.projectRoot
      ? {
          id: input.projectId ?? null,
          root: input.projectRoot,
        }
      : null,
    sources: input.sources ?? [],
    writes: input.writes ?? [],
    warnings: input.warnings ?? [],
    data: input.data ?? {},
    error: input.error ?? null,
  };
}

export function errorEnvelope(
  command: string,
  error: OpenAthorError,
): OpenAthorEnvelope {
  return envelope({
    ok: false,
    command,
    error: error.toJSON(),
  });
}
