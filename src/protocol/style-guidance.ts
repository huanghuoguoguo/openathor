import { parse as parseYaml } from "yaml";
import { extractStyleRules, type StyleRuleSet } from "./style-rules.js";
import {
  isPlainRecord,
  stringArray,
  uniqueLimited,
} from "./value.js";
import { asRecordArray } from "./yaml-records.js";

export type StyleGuidanceSource = {
  path: string;
  hash: string | null;
  text: string;
  truncated: boolean;
};

export type ActiveStyleProfileState = {
  activeProfile: Record<string, unknown> | null;
  profilesHash: string | null;
  confirmedProfileIds: string[];
  pendingProfileIds: string[];
  archivedProfileIds: string[];
};

export type StyleGuidance = {
  active_profile_present: boolean;
  active_profile_id: string | null;
  active_profile: Record<string, unknown> | null;
  confirmed_profile_ids: string[];
  pending_profile_ids: string[];
  archived_profile_ids: string[];
  rules: StyleRuleSet;
  sources: {
    manual_style: StyleGuidanceSourceSummary;
    profiles: StyleGuidanceSourceSummary;
    references: StyleGuidanceSourceSummary | null;
  };
  safety: {
    pending_profiles_excluded: boolean;
    reference_text_included: false;
    manuscript_generated_by_cli: false;
    guidance_source: "manual_style_only" | "manual_style_and_confirmed_active_profile";
  };
  next_agent_action: string;
};

type StyleGuidanceSourceSummary = {
  path: string;
  hash: string | null;
  present: boolean;
  truncated: boolean;
};

const NO_ACTIVE_PROFILE_ACTION =
  "Use manual style notes only; do not treat pending style profiles as project guidance.";
const ACTIVE_PROFILE_ACTION =
  "Use this confirmed active style profile as writing, review, and revision guidance.";

export function buildStyleGuidance(input: {
  manualStyle: StyleGuidanceSource;
  profiles: StyleGuidanceSource;
  references?: StyleGuidanceSource;
}): StyleGuidance {
  const profileState = activeStyleProfileStateFromSource(input.profiles);
  const manualRules = extractStyleRules(input.manualStyle.text);
  const activeProfileRules = profileState.activeProfile
    ? styleRulesFromProfile(profileState.activeProfile)
    : { do: [], avoid: [] };
  const rules = mergeStyleRules(manualRules, activeProfileRules);

  return {
    active_profile_present: profileState.activeProfile !== null,
    active_profile_id: profileId(profileState.activeProfile),
    active_profile: profileState.activeProfile,
    confirmed_profile_ids: profileState.confirmedProfileIds,
    pending_profile_ids: profileState.pendingProfileIds,
    archived_profile_ids: profileState.archivedProfileIds,
    rules,
    sources: {
      manual_style: sourceSummary(input.manualStyle),
      profiles: sourceSummary(input.profiles),
      references: input.references ? sourceSummary(input.references) : null,
    },
    safety: {
      pending_profiles_excluded: profileState.pendingProfileIds.length > 0,
      reference_text_included: false,
      manuscript_generated_by_cli: false,
      guidance_source: profileState.activeProfile
        ? "manual_style_and_confirmed_active_profile"
        : "manual_style_only",
    },
    next_agent_action: profileState.activeProfile
      ? ACTIVE_PROFILE_ACTION
      : NO_ACTIVE_PROFILE_ACTION,
  };
}

export function activeStyleProfileStateFromSource(
  profiles: Pick<StyleGuidanceSource, "text" | "hash">,
): ActiveStyleProfileState {
  return activeStyleProfileStateFromData(parseYamlRecord(profiles.text), profiles.hash);
}

export function activeStyleProfileStateFromData(
  profilesData: Record<string, unknown>,
  profilesHash: string | null,
): ActiveStyleProfileState {
  const profiles = asRecordArray(profilesData.profiles);
  const activeProfile =
    profiles.find(
      (profile) => profile.status === "confirmed" && profile.active === true,
    ) ?? null;

  return {
    activeProfile,
    profilesHash,
    confirmedProfileIds: profileIdsByStatus(profiles, "confirmed"),
    pendingProfileIds: profileIdsByStatus(profiles, "pending"),
    archivedProfileIds: profileIdsByStatus(profiles, "archived"),
  };
}

function parseYamlRecord(text: string): Record<string, unknown> {
  try {
    const parsed = parseYaml(text);
    return isPlainRecord(parsed) ? parsed : { profiles: [] };
  } catch {
    return { profiles: [] };
  }
}

function styleRulesFromProfile(profile: Record<string, unknown>): StyleRuleSet {
  return {
    do: stringArray(profile.do),
    avoid: stringArray(profile.avoid),
  };
}

function mergeStyleRules(manualRules: StyleRuleSet, activeProfileRules: StyleRuleSet): StyleRuleSet {
  return {
    do: uniqueLimited([...manualRules.do, ...activeProfileRules.do], 30),
    avoid: uniqueLimited([...manualRules.avoid, ...activeProfileRules.avoid], 30),
  };
}

function sourceSummary(source: StyleGuidanceSource): StyleGuidanceSourceSummary {
  return {
    path: source.path,
    hash: source.hash,
    present: source.hash !== null,
    truncated: source.truncated,
  };
}

function profileIdsByStatus(
  profiles: Array<Record<string, unknown>>,
  status: string,
): string[] {
  return profiles
    .filter((profile) => profile.status === status)
    .map(profileId)
    .filter((id): id is string => id !== null);
}

function profileId(profile: Record<string, unknown> | null): string | null {
  return typeof profile?.id === "string" && profile.id.trim()
    ? profile.id.trim()
    : null;
}
