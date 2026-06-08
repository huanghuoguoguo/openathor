export const rcBlockingFixtures = [
  "fixtures/slice-1/new-project",
  "fixtures/slice-1/adopt-3-chapters",
  "fixtures/slice-4/adopt-30-chapters",
  "fixtures/slice-2/draft-confirm-write",
  "fixtures/slice-2/revise-confirm-write",
  "fixtures/slice-2/canon-conflict",
  "fixtures/slice-3/outline-replan-confirm",
  "fixtures/slice-4/style-guided-writing-loop",
  "fixtures/slice-4/asset-sync-confirm",
  "fixtures/slice-4/replan-draft-asset-continuity",
] as const;

export type RcBlockingFixture = (typeof rcBlockingFixtures)[number];
