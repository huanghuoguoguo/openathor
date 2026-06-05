import type {
  AssetSyncPlan,
  IndexedChapter,
} from "./model.js";

export function assetSyncPendingText(
  stamp: string,
  targetChapter: IndexedChapter,
  sourceHash: string,
  plan: AssetSyncPlan,
): string {
  return [
    "",
    `## pending_${stamp}: Asset Sync Proposal`,
    "",
    "- status: pending",
    `- source_ref: ${targetChapter.id}`,
    `- source: ${targetChapter.source_path}`,
    `- source_hash: ${sourceHash}`,
    "- user_confirmation_required: true",
    "",
    "Summary:",
    "",
    `- new_characters: ${plan.new_characters.map((item) => `${item.name} (${item.id})`).join(", ") || "none"}`,
    `- new_timeline_events: ${plan.new_timeline_events.map((item) => `${item.title} (${item.id})`).join(", ") || "none"}`,
    `- new_hooks: ${plan.new_hooks.map((item) => `${item.title} (${item.id})`).join(", ") || "none"}`,
    `- existing_asset_updates_review: ${
      plan.existing_characters.length + plan.existing_timeline_events.length + plan.existing_hooks.length
    }`,
    "",
    "Chapter summary:",
    "",
    plan.package.chapter.summary ?? "(unchanged)",
    "",
    "Chapter links:",
    "",
    `- characters: ${plan.outline_links.characters.join(", ") || "none"}`,
    `- timeline_events: ${plan.outline_links.timeline_events.join(", ") || "none"}`,
    `- hooks: ${plan.outline_links.hooks.join(", ") || "none"}`,
    "",
  ].join("\n");
}
