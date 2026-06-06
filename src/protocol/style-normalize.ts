import { OpenAthorError } from "./errors.js";
import { ensureSafeRelativePath, toPosix } from "./paths.js";

export function normalizeStyleReferencePath(relPath: string | undefined): string {
  if (!relPath?.trim()) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_REQUIRED",
      "openathor style analyze requires a reference path.",
      { exitCode: 2 },
    );
  }

  const safeRelPath = toPosix(relPath.trim());
  ensureSafeRelativePath(safeRelPath, "reference path");

  return safeRelPath;
}

export function normalizeStyleProfileId(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (!/^[a-z][a-z0-9_-]{2,}$/i.test(candidate)) {
    throw new OpenAthorError(
      "OA_STYLE_PROFILE_INVALID",
      "Style profile id must start with a letter and contain only letters, numbers, underscores or dashes.",
      { exitCode: 2 },
    );
  }

  return candidate;
}

export function normalizeStylePermission(value: string | undefined): string {
  const permission = value?.trim() || "user_owned_or_authorized";
  const allowed = new Set([
    "user_owned_or_authorized",
    "user_owned",
    "licensed",
    "public_domain",
    "unknown",
  ]);

  if (!allowed.has(permission)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_PERMISSION_INVALID",
      `Unsupported style reference permission ${permission}.`,
      {
        exitCode: 2,
        hints: ["Use user_owned_or_authorized, user_owned, licensed, public_domain, or unknown."],
      },
    );
  }

  return permission;
}

export function normalizeStyleSourceType(value: string | undefined): string {
  const sourceType = value?.trim() || "user_provided";
  const allowed = new Set(["user_provided", "project_manuscript", "licensed_reference", "public_domain"]);

  if (!allowed.has(sourceType)) {
    throw new OpenAthorError(
      "OA_STYLE_REFERENCE_SOURCE_INVALID",
      `Unsupported style reference source type ${sourceType}.`,
      {
        exitCode: 2,
        hints: ["Use user_provided, project_manuscript, licensed_reference, or public_domain."],
      },
    );
  }

  return sourceType;
}
