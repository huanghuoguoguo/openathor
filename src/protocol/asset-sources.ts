export type AssetSourceText = {
  path: string;
  hash: string | null;
  text: string;
  truncated: boolean;
};

export type AssetAuditSources = {
  world: AssetSourceText;
  characters: AssetSourceText;
  timeline: AssetSourceText;
  hooks: AssetSourceText;
  canon: AssetSourceText;
  pendingCanon: AssetSourceText;
};
