import {
  assetSyncSummary,
} from "./asset-sync.js";
import type {
  EnvelopeSource,
  EnvelopeWrite,
} from "./envelope.js";
import type {
  AssetSyncPlan,
  IndexedChapter,
} from "./model.js";

const ASSET_SYNC_CONFIRMED_ACTION =
  "Run openathor index rebuild --json, then openathor assets audit --json " +
  "and refresh context before continuing the longform draft.";
const ASSET_SYNC_PROPOSAL_ACTION =
  "Show this pending asset sync to the user, then rerun with --confirm " +
  "--base-hash only after explicit approval.";

type AssetSyncCommandOutputInput = {
  confirm: boolean;
  dryRun: boolean;
  targetChapter: IndexedChapter;
  sourcePath: string;
  sourceHash: string;
  baseHash: string | null;
  assetSourceHashes: Record<string, string>;
  assetPackagePath: string;
  runRelPath: string;
  proposalRelPath: string;
  plan: AssetSyncPlan;
  writes: EnvelopeWrite[];
  sources: EnvelopeSource[];
};

export function assetSyncRunRecord(
  input: AssetSyncCommandOutputInput & { createdAt: string },
): Record<string, unknown> {
  return {
    agent_role: "openathor-cli",
    command: "openathor assets sync",
    created_at: input.createdAt,
    mode: input.confirm ? "confirmed_write" : "proposal",
    target: assetSyncTarget(input.targetChapter, input.sourcePath),
    source_hash: input.sourceHash,
    base_hash: input.baseHash,
    asset_hashes: input.assetSourceHashes,
    asset_package_path: input.assetPackagePath,
    summary: assetSyncSummary(input.plan),
    writes: input.writes,
    sources: input.sources,
    user_confirmation_required: !input.confirm,
  };
}

export function assetSyncResultData(input: AssetSyncCommandOutputInput): Record<string, unknown> {
  return {
    dry_run: input.dryRun,
    mode: input.confirm ? "confirmed_write" : "proposal",
    command: "openathor assets sync",
    target: assetSyncTarget(input.targetChapter, input.sourcePath),
    source_hash: input.sourceHash,
    base_hash: input.baseHash,
    asset_hashes: input.assetSourceHashes,
    asset_package_path: input.assetPackagePath,
    planned_writes: input.dryRun ? input.writes : [],
    run_path: input.runRelPath,
    proposal_path: input.confirm ? null : input.proposalRelPath,
    user_confirmation_required: !input.confirm,
    result: {
      characters_added: input.plan.new_characters.length,
      timeline_events_added: input.plan.new_timeline_events.length,
      hooks_added: input.plan.new_hooks.length,
      outline_modified: input.plan.outline_modified,
      confirmed_outline_written: input.confirm && input.plan.outline_modified,
      confirmed_assets_written: input.confirm,
    },
    sync: {
      method: "agent_structured_asset_package",
      package: input.plan.package,
      summary: assetSyncSummary(input.plan),
      outline_links: input.plan.outline_links,
      existing: {
        characters: input.plan.existing_characters.map((item) => item.id),
        timeline_events: input.plan.existing_timeline_events.map((item) => item.id),
        hooks: input.plan.existing_hooks.map((item) => item.id),
      },
      pending_note:
        "The CLI validates and merges structured asset packages; it does not " +
        "infer complex story facts from prose.",
    },
    next_agent_action: input.confirm
      ? ASSET_SYNC_CONFIRMED_ACTION
      : ASSET_SYNC_PROPOSAL_ACTION,
  };
}

function assetSyncTarget(targetChapter: IndexedChapter, sourcePath: string): Record<string, unknown> {
  return {
    id: targetChapter.id,
    display_order: targetChapter.display_order,
    title: targetChapter.title,
    source_path: sourcePath,
  };
}
